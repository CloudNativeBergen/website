import {
  defineMigration,
  createIfNotExists,
  at,
  patch,
  set,
} from 'sanity/migrate'
import type { SanityDocument } from '@sanity/types'

/**
 * ✅ RUN IN PRODUCTION — 2026-07-26 (GitHub Actions run 30198714455).
 *
 * LOAD-BEARING FOR AUTHORIZATION. `src/lib/authz/organizer.ts` denies when a
 * request's organization is unresolvable, and justifies that fail-closed posture
 * on this backfill having run ("every live conference has an `organization`").
 * That precondition is satisfied, and was re-verified against production on
 * 2026-08-05: ZERO non-draft `conference`, `speaker`, `topic`, `sponsor`,
 * `staff` or `message` documents lack the organization key, and the single
 * bootstrap org `organization-cloud-native-days` exists. If you are considering
 * reverting this data, read that deny rule first — it fails CLOSED on it.
 *
 * Do NOT re-run against `production` as a matter of course. It is idempotent
 * (docs already carrying the key are skipped, the org is created via
 * `createIfNotExists`), but a re-run is still an unnecessary production write.
 *
 * Bootstrap the MULTI-TENANT organization tier (CaaS T1-1, #613): create the
 * single `organization` (tenant) document and stamp its reference onto every
 * existing tenant-scoped document that lacks one.
 *
 * WHY: the schema now models an `organization` that OWNS conference editions and
 * all their scoped documents, and the creation paths stamp the tenant key onto
 * NEW documents going forward. But everything that predates this change carries
 * no key. Document-level security (#614) and query scoping (#616) build on the
 * key being present on EVERY document, so this migration backfills the current
 * single-tenant dataset: one organization, referenced everywhere.
 *
 * WHAT IT DOES:
 *   1. Creates ONE `organization` (deterministic _id `organization-cloud-native-days`)
 *      whose name is derived from the conferences' `organizer` field (default
 *      "Cloud Native Days"). Idempotent via `createIfNotExists`.
 *   2. `conference`  → set `organization` (single ref) where missing.
 *   3. `speaker`     → set `organizations` (ARRAY — a person can belong to
 *                      several tenants) to `[org]` where absent/empty.
 *   4. `topic`, `staff`, `sponsor`, `sponsorEmailTemplate` → set `organization`
 *      (single ref) where missing.
 *   5. `message`, `travelExpense`, `sponsorActivity`, `conversationPreference`
 *      → set the DENORMALIZED `organization` (single ref) where missing.
 *
 * SAFETY / IDEMPOTENCY: ADDITIVE ONLY. It creates the org idempotently, and only
 * ever sets the org key on documents that DON'T already carry it — it never
 * changes an existing key, never touches any other field, never deletes, and
 * skips DRAFTS (the published doc is the source of truth; a publish inherits it).
 * A re-run only patches whatever is still missing the key.
 *
 * SINGLE-TENANT BOOTSTRAP: the current dataset is one tenant, so every document
 * receives the SAME organization ref. Multi-tenant partitioning (distinct orgs)
 * is a later concern; this migration only establishes the key exists everywhere.
 *
 * HOW IT WAS RUN, and how to run it against ANOTHER dataset: intentionally,
 * after review, via the "Run Sanity Migration" workflow
 * (.github/workflows/run-migration.yml) with migration id
 * `044-organization-tier-backfill`. The workflow exports a dataset backup and
 * performs a dry run first. `production` has already had this applied (see
 * above).
 */

/** Deterministic id for the single bootstrap organization. */
const ORG_ID = 'organization-cloud-native-days'
/** Fallback name when no conference `organizer` value can be read. */
const DEFAULT_ORG_NAME = 'Cloud Native Days'
const DEFAULT_ORG_SLUG = 'cloud-native-days'

/** Single-ref types that carry the org directly (global + denormalized). */
const SINGLE_REF_TYPES = new Set([
  'conference',
  'topic',
  'staff',
  'sponsor',
  'sponsorEmailTemplate',
  'message',
  'travelExpense',
  'sponsorActivity',
  'conversationPreference',
])

const isDraft = (id: string): boolean => id.startsWith('drafts.')

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96) || DEFAULT_ORG_SLUG
  )
}

/** The strong organization reference stamped everywhere. */
function orgRef(): { _type: 'reference'; _ref: string } {
  return { _type: 'reference', _ref: ORG_ID }
}

/** The organizations[] array item for a speaker (needs a stable `_key`). */
function orgArrayItem(): Record<string, unknown> {
  return { _type: 'reference', _ref: ORG_ID, _key: ORG_ID }
}

interface ConferenceRow {
  _id: string
  organizer?: string
}

interface ScopedDoc extends SanityDocument {
  organization?: { _ref?: string } | null
  organizations?: Array<unknown> | null
}

export default defineMigration({
  title: 'Bootstrap organization tier — create org + stamp refs (CaaS T1-1)',
  description:
    'Creates the single organization document and additively stamps its ' +
    'reference onto every conference, speaker (as organizations[]), topic, ' +
    'staff, sponsor, sponsorEmailTemplate, message, travelExpense, ' +
    'sponsorActivity and conversationPreference lacking one. Additive and ' +
    'idempotent (skips docs already carrying the key, skips drafts). APPLIED to ' +
    'production on 2026-07-26 — run against another dataset via the Run Sanity ' +
    'Migration workflow after maintainer review.',
  documentTypes: [
    'conference',
    'speaker',
    'topic',
    'staff',
    'sponsor',
    'sponsorEmailTemplate',
    'message',
    'travelExpense',
    'sponsorActivity',
    'conversationPreference',
  ],

  async *migrate(documents, context) {
    // --- Pre-pass: derive the organization name from the conferences ---------
    // Use the most common non-empty `organizer` value; fall back to the default.
    const conferences = await context.client.fetch<ConferenceRow[]>(
      `*[_type == "conference" && !(_id in path("drafts.**"))]{ _id, organizer }`,
    )
    const counts = new Map<string, number>()
    for (const c of conferences ?? []) {
      const name = (c.organizer ?? '').trim()
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    let orgName = DEFAULT_ORG_NAME
    let best = 0
    for (const [name, count] of counts) {
      if (count > best) {
        best = count
        orgName = name
      }
    }
    const orgSlug = slugify(orgName)
    console.log(
      `  → Organization: "${orgName}" (${ORG_ID}, slug ${orgSlug}) — derived from ${conferences?.length ?? 0} conference(s).`,
    )

    // --- Create the single organization FIRST (strong refs need it to exist) -
    yield createIfNotExists({
      _id: ORG_ID,
      _type: 'organization',
      name: orgName,
      slug: { _type: 'slug', current: orgSlug },
    })

    // --- Stream every scoped document and stamp the key where missing --------
    const patched: Record<string, number> = {}
    const skipped: Record<string, number> = {}
    const bump = (m: Record<string, number>, t: string) =>
      (m[t] = (m[t] ?? 0) + 1)

    for await (const rawDoc of documents()) {
      const doc = rawDoc as ScopedDoc
      if (isDraft(doc._id)) continue

      if (doc._type === 'speaker') {
        // ARRAY membership: patch only when absent or empty.
        const hasMembership =
          Array.isArray(doc.organizations) && doc.organizations.length > 0
        if (hasMembership) {
          bump(skipped, 'speaker')
          continue
        }
        console.log(`  ✓ speaker ${doc._id}: set organizations = [${ORG_ID}]`)
        yield patch(doc._id, [at('organizations', set([orgArrayItem()]))])
        bump(patched, 'speaker')
        continue
      }

      if (SINGLE_REF_TYPES.has(doc._type)) {
        if (doc.organization?._ref) {
          bump(skipped, doc._type)
          continue
        }
        console.log(`  ✓ ${doc._type} ${doc._id}: set organization = ${ORG_ID}`)
        yield patch(doc._id, [at('organization', set(orgRef()))])
        bump(patched, doc._type)
      }
    }

    console.log('\n=== Organization backfill summary ===')
    const allTypes = ['speaker', ...SINGLE_REF_TYPES]
    for (const t of allTypes) {
      const p = patched[t] ?? 0
      const s = skipped[t] ?? 0
      if (p || s) {
        console.log(`  ${t}: ${p} patched, ${s} skipped (already had key)`)
      }
    }
  },
})
