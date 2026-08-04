#!/usr/bin/env tsx

/**
 * ONE-TIME BACKFILL for domain ownership verification (#683).
 *
 * Every `domains[]` entry that exists today was claimed BEFORE proof was a
 * requirement — including the two live production hosts. Turning routing
 * enforcement on without records for them would take production offline, so
 * this script mints one `domainVerification` document per existing claim with
 * `method: "grandfathered"`.
 *
 * A grandfathered record is honoured for `GRANDFATHER_GRACE_DAYS` (30) and NO
 * LONGER. It is an explicitly time-boxed exemption, not an amnesty: the admin
 * card shows the deadline, the daily sweep starts reporting the missing TXT
 * record immediately, and once `graceUntil` passes the claim is treated as
 * unproven — off the redirect allowlist and, if enforcement is on, unrouted.
 * Publishing the real TXT record (shown on /admin/settings) converts the record
 * to `dns-txt` on the next check and the exemption disappears for good.
 *
 * Hosts under `PLATFORM_DOMAIN_SUFFIX` are the exception: `ensureDomainVerification`
 * decides the method from the HOSTNAME, so a `<slug>.konf.run` entry is minted
 * `platform-owned` (permanent, no deadline) rather than grandfathered. Giving it
 * a 30-day deadline would be pointless — the challenge lives in a zone only the
 * platform can write to.
 *
 * Re-running is safe: hostnames that already have a record are left untouched.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-domain-verification.ts [--apply]
 *
 * Without `--apply` it only reports what it would do.
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), '.env.local'), override: true })

async function main() {
  const apply = process.argv.includes('--apply')

  const { clientReadUncached } = await import('../src/lib/sanity/client')
  // Imported from the MODULE, not the package barrel. The barrel re-exports
  // `sweep.ts`, which pulls in the notification/push stack and with it
  // `server-only` — which throws outside a Server Component, so importing the
  // barrel makes this script unrunnable. Same reasoning, and same fix, as the
  // note in `src/lib/conference/sanity.ts`.
  const { ensureDomainVerification, getDomainVerification } =
    await import('../src/lib/domain-verification/sanity')
  const { challengeRecordName, expectedTxtValue } =
    await import('../src/lib/domain-verification/challenge')
  const { normalizeDomain } = await import('../src/lib/conference/domains')

  const conferences = await clientReadUncached.fetch<
    { _id: string; title?: string; domains?: string[] }[]
  >(
    `*[_type == "conference" && count(domains) > 0] | order(title asc){ _id, title, domains }`,
  )

  let created = 0
  let skipped = 0

  for (const conference of conferences) {
    for (const raw of conference.domains ?? []) {
      const hostname = normalizeDomain(raw)
      if (!hostname) continue
      const existing = await getDomainVerification(hostname)
      if (existing) {
        skipped++
        console.log(
          `  skip  ${hostname.padEnd(40)} already has a record (${existing.status}/${existing.method})`,
        )
        continue
      }
      created++
      if (!apply) {
        console.log(
          `  plan  ${hostname.padEnd(40)} → grandfathered for ${conference.title ?? conference._id}`,
        )
        continue
      }
      await ensureDomainVerification(hostname, conference._id, {
        method: 'grandfathered',
      })
      const record = await getDomainVerification(hostname)
      const name = challengeRecordName(hostname)
      console.log(
        `  done  ${hostname.padEnd(40)} grandfathered until ${record?.graceUntil ?? '?'}`,
      )
      if (name && record) {
        console.log(
          `        publish: ${name} TXT "${expectedTxtValue(record.token)}"`,
        )
      }
    }
  }

  console.log(
    `\n${apply ? 'Backfilled' : 'Would backfill'} ${created} domain(s); ${skipped} already had records.`,
  )
  if (!apply && created > 0) {
    console.log('Re-run with --apply to write.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
