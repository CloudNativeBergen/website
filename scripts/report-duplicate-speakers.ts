/**
 * Duplicate-speaker detection REPORT (Phase 4, Part B).
 *
 * ============================ READ-ONLY ============================
 * This script makes NO writes. It only reads speaker documents and
 * their inbound references and prints/serializes a report. It never
 * merges, patches, or deletes anything. Merging is a deliberate,
 * human-reviewed action performed later via the Phase 3 admin tool.
 * ==================================================================
 *
 * It flags likely-duplicate speaker accounts by:
 *   1. overlapping normalized email (`email` / `knownEmails` intersection), and
 *   2. identical normalized name.
 *
 * For every candidate it enumerates inbound references
 * (`*[references($id)]{_id,_type}`) so an organizer can see the blast radius
 * (talks, invitations, schedules, galleries, …) each account carries before
 * deciding which record to keep.
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
  clusterDuplicateSpeakers,
  speakerEmailSet,
  type DuplicateSpeakerInput,
} from '@/lib/speaker/duplicates'

interface SpeakerRecord extends DuplicateSpeakerInput {
  _id: string
  name?: string | null
  email?: string | null
  knownEmails?: string[] | null
  providers?: string[] | null
  _createdAt?: string | null
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
    `*[_type == "speaker"]{
      _id,
      name,
      email,
      knownEmails,
      providers,
      _createdAt
    } | order(_createdAt asc)`,
  )

  console.log(`Loaded ${speakers.length} speaker document(s).`)

  const clusters = clusterDuplicateSpeakers(speakers)

  if (clusters.length === 0) {
    console.log('\n✅ No likely-duplicate speakers found.')
    if (jsonPath) {
      writeFileSync(
        jsonPath,
        JSON.stringify(
          { generatedAt: new Date().toISOString(), clusters: [] },
          null,
          2,
        ),
      )
      console.log(`\nEmpty report written to ${jsonPath}`)
    }
    return
  }

  const flaggedCount = clusters.reduce(
    (sum, cluster) => sum + cluster.members.length,
    0,
  )
  console.log(
    `\n⚠ Found ${clusters.length} likely-duplicate cluster(s) covering ${flaggedCount} speaker(s).\n`,
  )

  // Enumerate inbound references per member (blast radius). Read-only.
  const referencesById = new Map<string, InboundReference[]>()
  for (const cluster of clusters) {
    for (const member of cluster.members) {
      if (referencesById.has(member._id)) continue
      const refs = await clientReadUncached.fetch<InboundReference[]>(
        `*[references($id) && _id != $id]{ _id, _type }`,
        { id: member._id },
      )
      referencesById.set(member._id, refs ?? [])
    }
  }

  const jsonClusters = clusters.map((cluster, clusterIndex) => {
    const reasonLabel = cluster.reasons.join(' + ') || 'unknown'
    console.log(
      `── Cluster ${clusterIndex + 1} (${cluster.members.length} accounts, matched by: ${reasonLabel}) ─────────`,
    )
    if (cluster.sharedEmails.length > 0) {
      console.log(`   shared email(s): ${cluster.sharedEmails.join(', ')}`)
    }
    if (cluster.sharedNames.length > 0) {
      console.log(`   shared name(s):  ${cluster.sharedNames.join(', ')}`)
    }

    const members = cluster.members.map((member) => {
      const refs = referencesById.get(member._id) ?? []
      const summary = summarizeReferences(refs)
      const emails = speakerEmailSet(member)
      const providers = (member.providers ?? []).filter(Boolean)

      console.log(`\n   • ${member.name ?? '(no name)'}  [${member._id}]`)
      console.log(`       created:   ${member._createdAt ?? 'unknown'}`)
      console.log(
        `       emails:    ${emails.length > 0 ? emails.join(', ') : 'none'}`,
      )
      console.log(
        `       providers: ${providers.length > 0 ? providers.join(', ') : 'none'}`,
      )
      console.log(
        `       inbound refs: ${summary.total} (${formatByType(summary.byType)})`,
      )

      return {
        _id: member._id,
        name: member.name ?? null,
        emails,
        providers,
        _createdAt: member._createdAt ?? null,
        inboundReferences: {
          total: summary.total,
          byType: summary.byType,
          docs: refs,
        },
      }
    })

    console.log('')

    return {
      reasons: cluster.reasons,
      sharedEmails: cluster.sharedEmails,
      sharedNames: cluster.sharedNames,
      members,
    }
  })

  console.log(
    'Review these clusters and merge duplicates via the Phase 3 admin tool.',
  )
  console.log('This script made NO changes.')

  if (jsonPath) {
    writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          totalSpeakers: speakers.length,
          clusterCount: clusters.length,
          flaggedSpeakers: flaggedCount,
          clusters: jsonClusters,
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
