import 'server-only'
import { revalidateTag } from 'next/cache'
import { conferenceTag, organizationTag } from '@/lib/cache/tags'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'

const REQUEST_TIMEOUT_MS = 5_000
// One selection and one commit, each bounded. Leave time to answer in the route.
const BATCH_BUDGET_MS = 2 * REQUEST_TIMEOUT_MS

// groq-global: every conference a stored Judgement points at, across tenants.
const JUDGED_CONFERENCE_IDS = `*[_type == "contentJudgement"].conference._ref`
// groq-global: cron discovers every conference holding a Judgement, including
// ones with judgement off since; one read on a day with nothing stored.
const CONFERENCES = `*[_type == "conference" && _id in ${JUDGED_CONFERENCE_IDS}]{_id, "organizationId": organization._ref}`
const ORPHANS = `*[_type == "contentJudgement" && conference._ref == $conferenceId && !defined(content->_id)] | order(_id)[0...100]{_id, _rev}`
// groq-global: a judgement whose conference is gone cannot be reached by the
// conference-scoped pass. Only missing conferences qualify, regardless of content.
const MISSING_CONFERENCES = `*[_type == "contentJudgement" && !defined(conference->_id)] | order(_id)[0...100]{_id, _rev, "conferenceId": conference._ref}`

export interface SweepReport {
  conferences: number
  deleted: number
  timedOut: boolean
}

/** Daily erasure backstop for every content deletion path (spec §12). */
export async function sweepOrphanJudgements({
  now,
  deadline = new Date(now.getTime() + 280_000),
}: {
  now: Date
  deadline?: Date
}): Promise<SweepReport> {
  const report: SweepReport = { conferences: 0, deleted: 0, timedOut: false }
  const hasTime = (budget: number) => {
    if (Date.now() + budget > deadline.getTime()) report.timedOut = true
    return !report.timedOut
  }
  const requestOptions = () => ({
    timeout: REQUEST_TIMEOUT_MS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!hasTime(REQUEST_TIMEOUT_MS)) return report
  const conferences = await clientReadUncached.fetch<
    { _id: string; organizationId: string | null }[]
  >(CONFERENCES, {}, { cache: 'no-store', ...requestOptions() })

  const sweep = async (
    query: string,
    params: { conferenceId?: string },
    organizationId?: string | null,
  ) => {
    while (hasTime(BATCH_BUDGET_MS)) {
      const rows = await clientReadUncached.fetch<
        { _id: string; _rev: string; conferenceId?: string }[]
      >(query, params, { cache: 'no-store', ...requestOptions() })
      if (rows.length === 0) return
      if (!hasTime(REQUEST_TIMEOUT_MS)) return
      const tx = clientWrite.transaction()
      for (const row of rows) {
        // A deterministic id may have been replaced or moved since selection.
        tx.patch(row._id, (p) =>
          p.ifRevisionId(row._rev).unset(['_revision_lock_pseudo_field_']),
        ).delete(row._id)
      }
      // Synchronous visibility keeps the next page from selecting deleted ids.
      await tx.commit({ visibility: 'sync', ...requestOptions() })
      report.deleted += rows.length
      for (const id of new Set(
        rows.map((row) => params.conferenceId ?? row.conferenceId),
      )) {
        if (id) revalidateTag(conferenceTag(id), { expire: 0 })
      }
      // Disclosure is organization-wide: another edition may hold its last page.
      if (organizationId) {
        revalidateTag(organizationTag(organizationId), { expire: 0 })
      }
    }
  }

  for (const conference of conferences) {
    await sweep(
      ORPHANS,
      { conferenceId: conference._id },
      conference.organizationId,
    )
    if (report.timedOut) return report
    report.conferences++
  }
  await sweep(MISSING_CONFERENCES, {})
  return report
}
