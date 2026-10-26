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

export interface SweepReport {
  /** Conferences swept to the end. */
  conferences: number
  deleted: number
  /** Conferences whose pass failed; the next run tries them again. */
  failed: number
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
  const report: SweepReport = {
    conferences: 0,
    deleted: 0,
    failed: 0,
    timedOut: false,
  }
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

  // The conference's `contentJudgement.conference` reference is strong, so a
  // conference can't be deleted while a Judgement points at it: every
  // Judgement is reachable conference by conference.
  const sweep = async ({
    _id: conferenceId,
    organizationId,
  }: {
    _id: string
    organizationId: string | null
  }) => {
    while (hasTime(BATCH_BUDGET_MS)) {
      const rows = await clientReadUncached.fetch<
        { _id: string; _rev: string }[]
      >(ORPHANS, { conferenceId }, { cache: 'no-store', ...requestOptions() })
      if (rows.length === 0) return
      if (!hasTime(REQUEST_TIMEOUT_MS)) return
      const tx = clientWrite.transaction()
      for (const row of rows) {
        // A deterministic id may have been replaced since selection.
        tx.patch(row._id, (p) =>
          p.ifRevisionId(row._rev).unset(['_revision_lock_pseudo_field_']),
        ).delete(row._id)
      }
      // Synchronous visibility keeps the next page from selecting deleted ids.
      await tx.commit({ visibility: 'sync', ...requestOptions() })
      report.deleted += rows.length
      revalidateTag(conferenceTag(conferenceId), { expire: 0 })
      // Disclosure is organization-wide: another edition may hold its last page.
      if (organizationId) {
        revalidateTag(organizationTag(organizationId), { expire: 0 })
      }
    }
  }

  for (const conference of conferences) {
    try {
      await sweep(conference)
    } catch (error) {
      // One conference's refusal (a Judgement replaced since selection, an
      // outage) must not leave every other conference's orphans for a day.
      report.failed++
      console.error(
        `[content-judgement] sweep failed for conference ${conference._id}`,
        error,
      )
      continue
    }
    if (report.timedOut) return report
    report.conferences++
  }
  return report
}
