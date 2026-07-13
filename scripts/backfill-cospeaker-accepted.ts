#!/usr/bin/env tsx

/**
 * One-off backfill for the co-speaker invitation accept-flow bug: accepted
 * invitations got status == 'accepted' and an acceptedSpeaker reference, but
 * the speaker was never appended to the referenced talk's speakers[] array.
 *
 * For every coSpeakerInvitation with status == 'accepted', an acceptedSpeaker
 * ref and a proposal ref, this script checks whether the accepted speaker is
 * present in the talk's speakers[] and, if not, appends a keyed reference
 * (setIfMissing({speakers: []}) + append, guarded by ifRevisionId so a
 * concurrent edit aborts the patch instead of being clobbered).
 *
 * DRY-RUN BY DEFAULT — prints what would change without writing anything.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-cospeaker-accepted.ts           # dry-run
 *   pnpm tsx scripts/backfill-cospeaker-accepted.ts --apply   # write fixes
 *
 * Requires NEXT_PUBLIC_SANITY_PROJECT_ID / NEXT_PUBLIC_SANITY_DATASET and
 * SANITY_API_TOKEN_READ (plus SANITY_API_TOKEN_WRITE for --apply) in the
 * environment / .env / .env.local, same as the app itself.
 */

// Load env BEFORE importing anything that constructs the Sanity client at
// module load time (client.ts reads process.env eagerly). Static app imports
// would be hoisted above this, so app modules are pulled in dynamically below.
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), '.env.local'), override: true })

interface InvitationRow {
  _id: string
  speakerId: string
  proposalId: string
  invitedEmail?: string
  invitedName?: string
}

interface TalkRow {
  _id: string
  _rev: string
  title?: string
  speakerRefs: string[] | null
}

interface SpeakerRow {
  _id: string
  name?: string
  email?: string
}

type Verdict =
  | { kind: 'ok' } // speaker already in speakers[]
  | { kind: 'fix' } // missing — would append / appended
  | { kind: 'skip'; reason: string }

async function main() {
  const apply = process.argv.includes('--apply')

  // Relative specifiers (not the @/ alias) so tsx resolves the dynamic
  // imports reliably. The app modules keep using @/ internally; that's fine.
  const { clientReadUncached, clientWrite } =
    await import('../src/lib/sanity/client')
  const { createReferenceWithKey } = await import('../src/lib/sanity/helpers')

  console.log(
    `\nCo-speaker accepted-invitation backfill — mode: ${
      apply ? 'APPLY (writing)' : 'DRY-RUN (no writes; pass --apply to write)'
    }\n` + '='.repeat(72),
  )

  const invitations = await clientReadUncached.fetch<InvitationRow[]>(
    `*[_type == "coSpeakerInvitation"
        && !(_id in path("drafts.**"))
        && status == "accepted"
        && defined(acceptedSpeaker._ref)
        && defined(proposal._ref)]{
      _id,
      "speakerId": acceptedSpeaker._ref,
      "proposalId": proposal._ref,
      invitedEmail,
      invitedName,
    }`,
  )

  console.log(`Found ${invitations.length} accepted invitation(s) to check.\n`)

  if (invitations.length === 0) {
    console.log('Nothing to do.\n')
    return
  }

  // Bulk-fetch the referenced talks and speakers so dangling refs surface as
  // absent rows rather than per-invitation round trips.
  const talkIds = [...new Set(invitations.map((i) => i.proposalId))]
  const speakerIds = [...new Set(invitations.map((i) => i.speakerId))]

  const [talks, speakers] = await Promise.all([
    clientReadUncached.fetch<TalkRow[]>(
      `*[_type == "talk" && _id in $ids]{ _id, _rev, title, "speakerRefs": speakers[]._ref }`,
      { ids: talkIds },
    ),
    clientReadUncached.fetch<SpeakerRow[]>(
      `*[_type == "speaker" && _id in $ids]{ _id, name, email }`,
      { ids: speakerIds },
    ),
  ])

  const talkById = new Map(talks.map((t) => [t._id, t]))
  const speakerById = new Map(speakers.map((s) => [s._id, s]))

  // Classify every invitation, deduping (talk, speaker) pairs so two accepted
  // invitations for the same speaker+talk produce a single append.
  const verdicts: Array<{ inv: InvitationRow; verdict: Verdict }> = []
  const pendingByTalk = new Map<string, Set<string>>() // talkId -> speakerIds to append

  for (const inv of invitations) {
    const talk = talkById.get(inv.proposalId)
    const speaker = speakerById.get(inv.speakerId)

    if (!talk) {
      verdicts.push({
        inv,
        verdict: { kind: 'skip', reason: 'talk not found (dangling ref)' },
      })
      continue
    }
    if (!speaker) {
      verdicts.push({
        inv,
        verdict: { kind: 'skip', reason: 'speaker not found (dangling ref)' },
      })
      continue
    }
    if ((talk.speakerRefs ?? []).includes(inv.speakerId)) {
      verdicts.push({ inv, verdict: { kind: 'ok' } })
      continue
    }
    const pending = pendingByTalk.get(inv.proposalId)
    if (pending?.has(inv.speakerId)) {
      verdicts.push({
        inv,
        verdict: {
          kind: 'skip',
          reason: 'duplicate invitation (same talk+speaker already queued)',
        },
      })
      continue
    }
    verdicts.push({ inv, verdict: { kind: 'fix' } })
    if (pending) {
      pending.add(inv.speakerId)
    } else {
      pendingByTalk.set(inv.proposalId, new Set([inv.speakerId]))
    }
  }

  // Report table.
  console.table(
    verdicts.map(({ inv, verdict }) => {
      const talk = talkById.get(inv.proposalId)
      const speaker = speakerById.get(inv.speakerId)
      return {
        invitation: inv._id,
        proposal: inv.proposalId,
        title: talk?.title ?? '(missing)',
        speaker: inv.speakerId,
        who:
          speaker?.name ??
          speaker?.email ??
          inv.invitedName ??
          inv.invitedEmail ??
          '(missing)',
        action:
          verdict.kind === 'ok'
            ? 'OK (already in speakers[])'
            : verdict.kind === 'fix'
              ? apply
                ? 'FIX (append)'
                : 'WOULD FIX (append)'
              : `SKIP: ${verdict.reason}`,
      }
    }),
  )

  // Apply — one patch per talk (all missing speakers for that talk in a
  // single commit), guarded via ifRevisionId by the revision we read, so a
  // talk edited between read and write fails loudly for that talk only.
  let fixedTalks = 0
  let fixedSpeakerRefs = 0
  let failedTalks = 0

  if (apply && pendingByTalk.size > 0) {
    console.log(`Applying fixes to ${pendingByTalk.size} talk(s)...\n`)
    for (const [talkId, speakerIdsToAdd] of pendingByTalk) {
      const talk = talkById.get(talkId)!
      const refs = [...speakerIdsToAdd].map((id) => createReferenceWithKey(id))
      try {
        await clientWrite
          .patch(talkId)
          .ifRevisionId(talk._rev)
          .setIfMissing({ speakers: [] })
          .append('speakers', refs)
          .commit()
        fixedTalks += 1
        fixedSpeakerRefs += refs.length
        console.log(
          `  ✅ ${talkId} "${talk.title ?? ''}" — appended ${refs.length} speaker ref(s): ${[...speakerIdsToAdd].join(', ')}`,
        )
      } catch (err) {
        failedTalks += 1
        console.error(
          `  ⛔ ${talkId} "${talk.title ?? ''}" — patch failed (document may have changed since read; re-run the script):`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  }

  // Summary.
  const counts = { ok: 0, fix: 0, skip: 0 }
  const skipReasons = new Map<string, number>()
  for (const { verdict } of verdicts) {
    counts[verdict.kind] += 1
    if (verdict.kind === 'skip') {
      skipReasons.set(
        verdict.reason,
        (skipReasons.get(verdict.reason) ?? 0) + 1,
      )
    }
  }

  console.log('\n' + '='.repeat(72))
  console.log(`SUMMARY (${apply ? 'apply' : 'dry-run'})`)
  console.log(`  checked:            ${invitations.length} invitation(s)`)
  console.log(`  already OK (no-op): ${counts.ok}`)
  if (apply) {
    console.log(
      `  fixed:              ${counts.fix} invitation(s) → ${fixedSpeakerRefs} ref(s) appended across ${fixedTalks} talk(s)` +
        (failedTalks > 0 ? ` (${failedTalks} talk(s) FAILED)` : ''),
    )
  } else {
    console.log(
      `  would fix:          ${counts.fix} invitation(s) across ${pendingByTalk.size} talk(s)`,
    )
  }
  console.log(`  skipped:            ${counts.skip}`)
  for (const [reason, n] of skipReasons) {
    console.log(`      ↳ ${n} × ${reason}`)
  }
  if (!apply && counts.fix > 0) {
    console.log('\nRe-run with --apply to write these fixes.')
  }
  if (failedTalks > 0) {
    process.exitCode = 1
  }
  console.log('')
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
