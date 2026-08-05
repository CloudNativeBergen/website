/**
 * Duplicate-speaker detection REPORT.
 *
 * ============================ READ-ONLY ============================
 * This script makes NO writes. It only reads speaker documents and
 * their inbound references and prints/serializes a report. It never
 * merges, patches, or deletes anything. Merging is a deliberate,
 * human-reviewed action performed via the admin merge tool.
 * ==================================================================
 *
 * CROSS-TENANT BY DESIGN, and that is the difference from the in-app surface.
 * `speaker.admin.duplicateCandidates` is scoped to one organization because an
 * organizer may only see and merge their own people. This script is an operator
 * tool run with a dataset credential: it scans EVERY speaker document so the
 * platform owner can see the whole picture. Both share one detector
 * (`src/lib/speaker/duplicates.ts`) so the two can never disagree about what a
 * duplicate is.
 *
 * For every candidate it enumerates inbound references
 * (`*[references($id)]{_id,_type}`) so a human can see the blast radius (talks,
 * invitations, schedules, galleries, …) each account carries before deciding
 * which record to keep.
 *
 * Usage:
 *   tsx scripts/report-duplicate-speakers.ts [--json <path>]
 *
 * Output: a human-readable report to stdout, and (with --json) a machine
 * readable JSON file for further processing.
 */

import { writeFileSync } from 'node:fs'
import { clientReadUncached } from '@/lib/sanity/client'
import {
  findDuplicateSpeakerCandidates,
  speakerEmailSet,
  SIGNAL_LABEL,
  type DuplicateSpeakerInput,
} from '@/lib/speaker/duplicates'

interface SpeakerRecord extends DuplicateSpeakerInput {
  _id: string
  name?: string | null
  slug?: string | null
  email?: string | null
  knownEmails?: string[] | null
  providers?: string[] | null
  _createdAt?: string | null
  talkCount?: number
  confirmedTalkCount?: number
}

interface InboundReference {
  _id: string
  _type: string
}

function parseArgs(argv: string[]): { jsonPath?: string } {
  const jsonFlag = argv.indexOf('--json')
  if (jsonFlag !== -1) {
    return { jsonPath: argv[jsonFlag + 1] ?? 'duplicate-speakers-report.json' }
  }
  return {}
}

/** Count and group a speaker's inbound references by document `_type`. */
function summarizeReferences(refs: InboundReference[]): {
  total: number
  byType: Record<string, number>
} {
  const byType: Record<string, number> = {}
  for (const ref of refs) {
    byType[ref._type] = (byType[ref._type] ?? 0) + 1
  }
  return { total: refs.length, byType }
}

function formatByType(byType: Record<string, number>): string {
  const entries = Object.entries(byType).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return 'none'
  return entries.map(([type, count]) => `${type}×${count}`).join(', ')
}

async function reportDuplicateSpeakers(): Promise<void> {
  const { jsonPath } = parseArgs(process.argv.slice(2))

  console.log('Duplicate-speaker detection report (READ-ONLY — no writes)\n')

  const speakers = await clientReadUncached.fetch<SpeakerRecord[]>(
    // groq-global: operator tool, run with a dataset credential to see EVERY
    // tenant's speakers. The in-app surface is org-scoped; see the header.
    `*[_type == "speaker"]{
      _id,
      name,
      email,
      knownEmails,
      providers,
      _createdAt,
      "slug": slug.current,
      "talkCount": count(*[_type == "talk" && references(^._id)]),
      "confirmedTalkCount": count(*[_type == "talk" && references(^._id) && status == "confirmed"])
    } | order(_createdAt asc)`,
  )

  console.log(`Loaded ${speakers.length} speaker document(s).`)

  const groups = findDuplicateSpeakerCandidates(speakers)

  if (groups.length === 0) {
    console.log('\n✅ No likely-duplicate speakers found.')
    if (jsonPath) {
      writeFileSync(
        jsonPath,
        JSON.stringify(
          { generatedAt: new Date().toISOString(), groups: [] },
          null,
          2,
        ),
      )
      console.log(`\nEmpty report written to ${jsonPath}`)
    }
    return
  }

  const flaggedIds = new Set(
    groups.flatMap((group) => group.members.map((member) => member._id)),
  )
  const certainCount = groups.filter(
    (group) => group.confidence === 'certain',
  ).length
  console.log(
    `\n⚠ Found ${groups.length} duplicate candidate group(s) (${certainCount} certain) covering ${flaggedIds.size} speaker(s).\n`,
  )

  // Enumerate inbound references per member (blast radius). Read-only, and in
  // ONE round trip: this is a global scan, so the flagged set grows with the
  // dataset rather than staying the ~25 documents one tenant sees.
  const referencesById = new Map<string, InboundReference[]>()
  const referenceRows = await clientReadUncached.fetch<
    { _id: string; refs: InboundReference[] | null }[]
  >(
    // groq-global: operator tool; see the header. The root filter is a bounded
    // id list produced by the scan above, not a listing.
    `*[_id in $ids]{ _id, "refs": *[references(^._id) && _id != ^._id]{ _id, _type } }`,
    { ids: Array.from(flaggedIds) },
  )
  for (const row of referenceRows ?? []) {
    referencesById.set(row._id, row.refs ?? [])
  }

  const jsonGroups = groups.map((group, groupIndex) => {
    const corroboration =
      group.corroboratingSignals.length > 0
        ? ` (also: ${group.corroboratingSignals
            .map((signal) => SIGNAL_LABEL[signal])
            .join(', ')})`
        : ''
    console.log(
      `── Group ${groupIndex + 1} [${group.confidence.toUpperCase()}] ${SIGNAL_LABEL[group.signal]}: ${group.value} — ${group.members.length} accounts${corroboration} ─────────`,
    )

    const members = group.members.map((member) => {
      const refs = referencesById.get(member._id) ?? []
      const summary = summarizeReferences(refs)
      const emails = speakerEmailSet(member)
      const providers = (member.providers ?? []).filter(Boolean)
      const survivorMark =
        member._id === group.suggestedSurvivorId
          ? `  ← suggested survivor (${group.survivorReason})`
          : ''

      console.log(
        `\n   • ${member.name ?? '(no name)'}  [${member._id}]${survivorMark}`,
      )
      console.log(`       created:   ${member._createdAt ?? 'unknown'}`)
      console.log(`       slug:      ${member.slug ?? 'none'}`)
      console.log(
        `       emails:    ${emails.length > 0 ? emails.join(', ') : 'none'}`,
      )
      console.log(
        `       providers: ${providers.length > 0 ? providers.join(', ') : 'none'}`,
      )
      console.log(
        `       talks:     ${member.talkCount ?? 0} (${member.confirmedTalkCount ?? 0} confirmed)`,
      )
      console.log(
        `       inbound refs: ${summary.total} (${formatByType(summary.byType)})`,
      )

      return {
        _id: member._id,
        name: member.name ?? null,
        slug: member.slug ?? null,
        emails,
        providers,
        _createdAt: member._createdAt ?? null,
        talkCount: member.talkCount ?? 0,
        confirmedTalkCount: member.confirmedTalkCount ?? 0,
        isSuggestedSurvivor: member._id === group.suggestedSurvivorId,
        inboundReferences: {
          total: summary.total,
          byType: summary.byType,
          docs: refs,
        },
      }
    })

    console.log('')

    return {
      id: group.id,
      signal: group.signal,
      confidence: group.confidence,
      value: group.value,
      corroboratingSignals: group.corroboratingSignals,
      suggestedSurvivorId: group.suggestedSurvivorId,
      survivorReason: group.survivorReason,
      members,
    }
  })

  console.log(
    'Review these groups and merge duplicates via the admin speakers page.',
  )
  console.log('This script made NO changes.')

  if (jsonPath) {
    writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          totalSpeakers: speakers.length,
          groupCount: groups.length,
          flaggedSpeakers: flaggedIds.size,
          groups: jsonGroups,
        },
        null,
        2,
      ),
    )
    console.log(`\nMachine-readable report written to ${jsonPath}`)
  }
}

reportDuplicateSpeakers().catch((error) => {
  console.error('Error generating duplicate-speaker report:', error)
  process.exit(1)
})
