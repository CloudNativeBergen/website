/**
 * Operator CLI for right-to-erasure Phase 1 (RunKonf/platform#52).
 *
 *   pnpm erase-speaker <speakerId> --actor "<who>"          # DRY RUN (default)
 *   pnpm erase-speaker <speakerId> --actor "<who>" --commit # writes
 *   pnpm erase-speaker <speakerId> --verify                 # verification only
 *
 * DRY RUN IS THE DEFAULT AND `--commit` IS DELIBERATELY VERBOSE. This is the
 * one operation in the repo that cannot be undone by re-running it.
 *
 * Read `docs/SPEAKER_ERASURE_RUNBOOK.md` before using this. It covers who may
 * run it, how an out-of-band request is verified, and — the part the operator
 * has to get right when replying to the person — what Phase 1 does NOT erase.
 *
 * NOTE ON CACHES: `revalidateTag` needs a Next.js request scope, which a `tsx`
 * script has none of. The script therefore prints the tags rather than
 * pretending to revalidate them; the runbook has the manual step.
 */

import {
  eraseSpeakerInPlace,
  verifySpeakerErasure,
  type ErasurePlan,
} from '@/lib/speaker/erasure'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function printPlan(plan: ErasurePlan): void {
  console.log(`\nSpeaker:        ${plan.speakerId}`)
  console.log(`Becomes:        "${plan.targetName}" / ${plan.targetSlug}`)
  console.log(`Email becomes:  ${plan.targetEmail}`)
  console.log(
    `Speaker fields: ${Object.keys(plan.speakerSet).length} replaced, ` +
      `${plan.speakerUnset.length} unset` +
      (plan.speakerSetIfMissing.erasedAt ? ', erasedAt written' : ''),
  )
  console.log(`Image asset:    ${plan.imageAssetId ?? '(none)'}`)

  console.log(`\nDependent patches (${plan.documentPatches.length}):`)
  for (const patch of plan.documentPatches) {
    console.log(`  ${patch.type.padEnd(22)} ${patch.id}  — ${patch.reason}`)
  }

  console.log(`\nDependent deletes (${plan.documentDeletes.length}):`)
  for (const del of plan.documentDeletes) {
    console.log(`  ${del.type.padEnd(22)} ${del.id}  — ${del.reason}`)
  }

  if (plan.retainedBanking.length > 0) {
    console.log(
      `\nBanking details RETAINED (${plan.retainedBanking.length}) — ` +
        'these are NOT erased and must be named in the reply:',
    )
    for (const record of plan.retainedBanking) {
      const why =
        record.reason === 'paid'
          ? 'PAID — retained under legal obligation (Norwegian bookkeeping)'
          : 'UNRECOGNISED STATUS — retained by fail-closed rule, check by hand'
      console.log(
        `  travelSupport ${record.id}  status=${record.status}  ${why}`,
      )
    }
  }

  if (plan.refusals.length > 0) {
    console.log('\nREFUSED:')
    for (const refusal of plan.refusals) console.log(`  - ${refusal}`)
  }
}

function printVerification(
  verification: Awaited<ReturnType<typeof verifySpeakerErasure>>,
): void {
  if (!verification) {
    console.log('\nVerification: speaker document not found.')
    return
  }
  console.log(
    `\nVerification: ${verification.clean ? 'CLEAN' : 'RESIDUAL DATA FOUND'}`,
  )
  console.log(JSON.stringify(verification.residual, null, 2))
}

async function main(): Promise<number> {
  const speakerId = process.argv[2]
  if (!speakerId || speakerId.startsWith('--')) {
    console.error(
      'Usage: pnpm erase-speaker <speakerId> --actor "<who>" [--commit]\n' +
        '       pnpm erase-speaker <speakerId> --verify\n\n' +
        'Read docs/SPEAKER_ERASURE_RUNBOOK.md first.',
    )
    return 1
  }

  if (has('verify')) {
    printVerification(await verifySpeakerErasure(speakerId))
    return 0
  }

  const commit = has('commit')
  const actor = arg('actor')
  if (commit && !actor) {
    console.error('--commit requires --actor "<who is running this>".')
    return 1
  }

  console.log(commit ? '=== ERASING (writes) ===' : '=== DRY RUN ===')

  const result = await eraseSpeakerInPlace({
    speakerId,
    actor: actor ?? 'dry-run',
    dryRun: !commit,
  })

  if (result.plan) printPlan(result.plan)

  if (result.err) {
    console.error(`\nFAILED: ${result.err.message}`)
    return 1
  }

  if (!commit) {
    console.log('\nNothing was written. Re-run with --commit to apply.')
    return 0
  }

  console.log(
    `\nCommitted: ${result.committed}` +
      (result.plan?.noop ? ' (already erased — nothing to write)' : ''),
  )
  console.log(
    `Image asset: ${
      result.imageAsset.id === null
        ? 'none'
        : result.imageAsset.deleted
          ? `deleted ${result.imageAsset.id}`
          : `NOT deleted (${result.imageAsset.id}, ` +
            `remainingReferences=${result.imageAsset.remainingReferences}) — ` +
            'see the runbook step on orphaned assets'
    }`,
  )
  console.log(`\nCache tags to invalidate (see the runbook):`)
  for (const tag of result.cache.tags) console.log(`  ${tag}`)

  printVerification(result.verification)

  return result.verification?.clean ? 0 : 1
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
