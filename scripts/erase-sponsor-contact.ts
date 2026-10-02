/**
 * Operator CLI: erase a SPONSOR CONTACT from the records of emails sent to
 * them (#1265). For a person with a speaker document use `pnpm erase-speaker`,
 * which does this as one of its steps.
 *
 *   pnpm erase-sponsor-contact --email <a@x.com[,b@y.com]> --actor "<who>"           # DRY RUN
 *   pnpm erase-sponsor-contact --email <a@x.com[,b@y.com]> --actor "<who>" --commit  # writes
 *
 * Read the "Sent communications" section of `docs/SPEAKER_ERASURE_RUNBOOK.md`
 * first: what this replaces, what it keeps, and what it cannot reach.
 */

import { eraseSponsorContactSendRecords } from '@/lib/sponsor-crm/contact-erasure'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main(): Promise<number> {
  const emails = (arg('email') ?? '').split(',').filter(Boolean)
  const commit = has('commit')
  const actor = arg('actor')
  if (emails.length === 0 || (commit && !actor)) {
    console.error(
      'Usage: pnpm erase-sponsor-contact --email <a@x.com[,b@y.com]> --actor "<who>" [--commit]\n\n' +
        'Read docs/SPEAKER_ERASURE_RUNBOOK.md ("Sent communications") first.',
    )
    return 1
  }

  console.log(commit ? '=== ERASING (writes) ===' : '=== DRY RUN ===')
  const result = await eraseSponsorContactSendRecords({
    emails,
    actor: actor ?? 'dry-run',
    dryRun: !commit,
  })

  console.log(`\nAddresses:      ${result.emails.join(', ')}`)
  console.log(`Records found:  ${result.matched}`)
  console.log(`Redactions (${result.patches.length}):`)
  for (const patch of result.patches) {
    console.log(`  ${patch.id}  — ${patch.reason}`)
  }
  if (result.refusals.length > 0) {
    console.log('\nREFUSED:')
    for (const refusal of result.refusals) console.log(`  - ${refusal}`)
  }
  if (result.err) {
    console.error(`\nFAILED: ${result.err.message}`)
    return 1
  }
  if (!commit) {
    console.log('\nNothing was written. Re-run with --commit to apply.')
    return 0
  }
  console.log(`\nCommitted: ${result.committed}`)
  console.log(
    `Verification: ${result.residual === 0 ? 'CLEAN' : `RESIDUAL DATA FOUND (${result.residual})`}`,
  )
  console.log(
    '\nNot reached by this tool: the contact entry on the sponsor itself ' +
      '(remove it in the CRM), and any name written into the subject or ' +
      'body of the emails (free text, see the runbook).',
  )
  return result.residual === 0 ? 0 : 1
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
