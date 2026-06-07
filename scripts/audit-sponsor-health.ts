#!/usr/bin/env tsx

/**
 * Read-only back-catalog audit for the sponsor CRM state-machine invariants
 * (issue #379). Lists every sponsor currently violating a guard on any axis,
 * across every conference, exactly as the in-app data-health panel would —
 * it reuses the same production query (listSponsorsForConference, which
 * dereferences tier so a dangling ref shows up as a missing tier) and the same
 * auditSponsorHealth() predicate. NO WRITES.
 *
 * Usage:
 *   pnpm tsx scripts/audit-sponsor-health.ts
 */

// Load env BEFORE importing anything that constructs the Sanity client at module
// load time (client.ts reads process.env eagerly). Static app imports would be
// hoisted above this, so the app modules are pulled in via dynamic import below.
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), '.env.local'), override: true })

async function main() {
  // Relative specifiers (not the @/ alias) so tsx resolves the dynamic imports
  // reliably. The app modules keep using @/ internally; that's fine.
  const { listSponsorsForConference } =
    await import('../src/lib/sponsor-crm/sanity')
  const { auditSponsorHealth } = await import('../src/lib/sponsor-crm/health')
  const { clientReadUncached } = await import('../src/lib/sanity/client')

  const conferences = await clientReadUncached.fetch<
    { _id: string; title?: string }[]
  >(`*[_type == "conference"] | order(startDate desc){ _id, title }`)

  const totalDocs = await clientReadUncached.fetch<number>(
    `count(*[_type == "sponsorForConference"])`,
  )

  console.log(
    `\nAuditing ${totalDocs} sponsorForConference doc(s) across ${conferences.length} conference(s)\n` +
      '='.repeat(72),
  )

  let grandSponsors = 0
  let grandViolations = 0
  let grandHidden = 0

  for (const conf of conferences) {
    const { sponsors, error } = await listSponsorsForConference(conf._id)
    if (error) {
      console.log(`\n⛔ ${conf.title ?? conf._id}: failed to list — ${error}`)
      continue
    }
    const roster = sponsors ?? []
    grandSponsors += roster.length

    const violations = auditSponsorHealth(roster)
    if (violations.length === 0) {
      console.log(
        `\n✅ ${conf.title ?? conf._id} — ${roster.length} sponsor(s), 0 violations`,
      )
      continue
    }

    grandViolations += violations.length

    // Group by sponsor so a record breaking several axes reads as one block.
    const bySponsor = new Map<string, typeof violations>()
    for (const v of violations) {
      const list = bySponsor.get(v.sponsorId) ?? []
      list.push(v)
      bySponsor.set(v.sponsorId, list)
    }

    console.log(
      `\n❌ ${conf.title ?? conf._id} — ${roster.length} sponsor(s), ` +
        `${violations.length} violation(s) across ${bySponsor.size} sponsor(s)`,
    )

    for (const [sponsorId, vs] of bySponsor) {
      const hidden = vs.some((v) => v.hidesFromPublicSite)
      if (hidden) grandHidden += 1
      console.log(
        `\n  ${hidden ? '🔴 HIDDEN FROM PUBLIC SITE — ' : ''}${vs[0].sponsorName}` +
          `  [${sponsorId}]`,
      )
      for (const v of vs) {
        console.log(`    • axis=${v.axis}  state="${v.state}"`)
        for (const m of v.missing) {
          console.log(`        ↳ ${m.field}: ${m.message}`)
        }
      }
    }
  }

  console.log('\n' + '='.repeat(72))
  console.log(
    `SUMMARY: ${grandViolations} violation(s) over ${grandSponsors} sponsor(s); ` +
      `${grandHidden} sponsor(s) hidden from the public site.`,
  )
  if (grandSponsors !== totalDocs) {
    console.log(
      `⚠️  Audited ${grandSponsors} of ${totalDocs} docs — the ` +
        `${totalDocs - grandSponsors} difference likely reference a missing/` +
        `deleted conference (orphans) and were not reachable via any conference.`,
    )
  }
  console.log('')
}

main().catch((err) => {
  console.error('Audit failed:', err)
  process.exit(1)
})
