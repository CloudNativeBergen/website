/**
 * Backfill `status` + `version` on schedule documents that predate the
 * schedule-drafts architecture.
 *
 * SCOPED BY DESIGN: the Sanity dataset is shared by every tenant, so this
 * migration REQUIRES an explicit conference to operate on and refuses to run
 * without one. Never widen the query to `*[_type == "schedule"]` — that is an
 * unscoped bulk write across all tenants.
 *
 * Usage:
 *   pnpm tsx scripts/migrate-schedules.ts <conference-id | conference-domain>
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
config({ path: '.env' })

import { clientWrite } from '../src/lib/sanity/client'
import { ScheduleStatus } from '../src/lib/schedule/types'
import { normalizeDomain } from '../src/lib/conference/domains'

async function resolveConferenceId(target: string): Promise<string> {
  const domain = normalizeDomain(target)
  const conference = await clientWrite.fetch<{
    _id: string
    title?: string
  } | null>(
    `*[_type == "conference" && (_id == $target || $domain in domains)][0]{ _id, title }`,
    { target, domain },
  )

  if (!conference) {
    throw new Error(
      `No conference matched "${target}" (tried document id and domains[]).`,
    )
  }

  console.log(
    `Scoping migration to conference ${conference._id}${
      conference.title ? ` (${conference.title})` : ''
    }`,
  )
  return conference._id
}

async function migrate() {
  const target = process.argv[2]
  if (!target) {
    throw new Error(
      'Missing conference argument.\n' +
        'Usage: pnpm tsx scripts/migrate-schedules.ts <conference-id | conference-domain>',
    )
  }

  const conferenceId = await resolveConferenceId(target)

  const schedules = await clientWrite.fetch<{ _id: string }[]>(
    `*[_type == "schedule" && conference._ref == $conferenceId && !defined(status)]{ _id }`,
    { conferenceId },
  )

  if (schedules.length === 0) {
    console.log('No schedules to migrate.')
    return
  }

  const tx = clientWrite.transaction()
  for (const s of schedules) {
    console.log(`Migrating schedule ${s._id}...`)
    tx.patch(s._id, (p) =>
      p.set({
        status: ScheduleStatus.Official,
        version: 1,
      }),
    )
  }

  await tx.commit()
  console.log(`Successfully migrated ${schedules.length} schedules.`)
}

migrate().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
