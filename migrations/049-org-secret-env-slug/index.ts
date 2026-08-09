import { at, defineMigration, patch, set } from 'sanity/migrate'
import type { SanityDocument } from '@sanity/types'
import { secretEnvSlugProblem } from '../../sanity/lib/secretEnvSlug'

/**
 * ⏳ NOT YET RUN IN PRODUCTION.
 *
 * Set `organization.secretEnvSlug = 'CNDN'` on `organization-cloud-native-days`
 * — the backfill for RunKonf/platform#57, which moved the tenant → env-var-slug
 * mapping out of a code constant (`TENANT_ENV_SLUGS` in
 * `src/lib/secrets/env-per-org.ts`) and into the organization document.
 *
 * ── RUN THIS BEFORE THE PR THAT REMOVES THE CONSTANT IS DEPLOYED ────────────
 *
 * The value it writes is the value the constant held. Until it has run, the
 * deployed code can no longer name CNDN's `TENANT_CNDN_*` variables:
 *   - email resolves to `null`, so CNDN drops back to the platform Resend
 *     account with the sender policy re-applied;
 *   - ticketing resolves to `null`, so its surfaces read "unconfigured".
 * Both are the pre-#57 behaviour rather than an outage, which is why this is
 * sequenced as "run before deploy" and not as a hard gate. Neither is silent
 * after this PR — but neither is what anybody wants either.
 *
 * ── WHY A MIGRATION AND NOT A HAND-EDIT ────────────────────────────────────
 *
 * The field is deliberately hard to change once set: the Studio renders it
 * `readOnly` when populated and its validation rule refuses a change against
 * the published value, because the environment variables it names live in
 * Vercel and would orphan. That makes the FIRST write the one that has to be
 * right, and a reviewed, dry-runnable, idempotent migration is the way to make
 * a one-shot write reviewable. It is also the escape hatch: an `unset` here is
 * how a genuine correction gets made.
 *
 * ── SAFETY / IDEMPOTENCY ───────────────────────────────────────────────────
 *
 * ADDITIVE AND CONDITIONAL. It writes only when the field is ABSENT, so a
 * re-run patches nothing and an existing value is never overwritten — which
 * matters more here than usual, since overwriting is precisely the operation
 * the schema forbids everywhere else. It touches exactly one document id, one
 * field, never deletes, and skips drafts.
 *
 * It ABORTS rather than guessing if the target document does not exist or is
 * not an `organization`: writing this field onto the wrong document would bind
 * another tenant to CNDN's credentials, and the resolver's duplicate-slug guard
 * would then refuse BOTH orgs.
 *
 * The value is validated against the SAME `secretEnvSlugProblem` vocabulary the
 * schema and the resolver use, so this migration cannot write a value the
 * resolver would later reject as malformed.
 *
 * ── HOW TO RUN ─────────────────────────────────────────────────────────────
 *
 * Via the "Run Sanity Migration" workflow (`.github/workflows/run-migration.yml`)
 * with migration id `049-org-secret-env-slug`. It exports a dataset backup and
 * performs a dry run first. Do NOT run it from a laptop.
 */

/** The one organization this migration touches. */
const ORG_ID = 'organization-cloud-native-days'

/**
 * The value `TENANT_ENV_SLUGS` held, quoted as a LITERAL rather than imported
 * from the code it is being removed from — an import would make this migration
 * write whatever that constant later became, or fail to compile once it was
 * gone, destroying the thing it exists to preserve. (Same rule as migration
 * 047.) The variables already set in Vercel are `TENANT_CNDN_EMAIL_API_KEY` and
 * friends; this string is what makes the code look those up again.
 */
const SECRET_ENV_SLUG = 'CNDN'

interface OrganizationDoc extends SanityDocument {
  secretEnvSlug?: string | null
}

const isDraft = (id: string): boolean => id.startsWith('drafts.')

export default defineMigration({
  title: 'Backfill organization.secretEnvSlug for Cloud Native Days',
  description:
    'Sets secretEnvSlug = "CNDN" on organization-cloud-native-days, the value ' +
    'the removed TENANT_ENV_SLUGS constant held (RunKonf/platform#57). ' +
    'Additive, conditional on the field being absent, idempotent, one document, ' +
    'one field. Aborts if the target organization does not exist. Run via the ' +
    'Run Sanity Migration workflow BEFORE deploying the PR that removes the ' +
    'constant.',
  documentTypes: ['organization'],

  async *migrate(documents, context) {
    const problem = secretEnvSlugProblem(SECRET_ENV_SLUG)
    if (problem) {
      throw new Error(
        `[049] refusing to run: the value ${JSON.stringify(SECRET_ENV_SLUG)} ${problem}`,
      )
    }

    // TARGETING GUARD, before a single patch is yielded. A missing target means
    // the dataset is not the one this migration was written for.
    const target = await context.client.fetch<{
      _id: string
      _type: string
      secretEnvSlug?: string | null
    } | null>(`*[_id == $id][0]{ _id, _type, secretEnvSlug }`, { id: ORG_ID })

    if (!target || target._type !== 'organization') {
      throw new Error(
        `[049] refusing to run: ${ORG_ID} is ${target ? `a ${target._type}` : 'missing'} in this dataset, not an organization. This migration is written for the Cloud Native Days dataset only.`,
      )
    }

    // A DIFFERENT non-empty value is a hard stop, not a skip. It means somebody
    // already bound this tenant to other variables and re-keying it here would
    // orphan them silently — exactly what the field's immutability protects.
    const existing = (target.secretEnvSlug ?? '').trim()
    if (existing && existing !== SECRET_ENV_SLUG) {
      throw new Error(
        `[049] refusing to run: ${ORG_ID} already carries secretEnvSlug ${JSON.stringify(existing)}, not ${JSON.stringify(SECRET_ENV_SLUG)}. Changing it would orphan the TENANT_${existing}_* environment variables.`,
      )
    }

    // A SECOND holder of the same slug would make the resolver refuse BOTH orgs
    // (a shared slug is a cross-tenant credential leak by typo), so it aborts
    // rather than creating that state.
    const clash = await context.client.fetch<string | null>(
      `*[_type == "organization" && secretEnvSlug == $slug && _id != $id && !(_id in path("drafts.**"))][0]._id`,
      { slug: SECRET_ENV_SLUG, id: ORG_ID },
    )
    if (clash) {
      throw new Error(
        `[049] refusing to run: ${clash} already claims secretEnvSlug ${SECRET_ENV_SLUG}. Two organizations sharing one slug would read the same credentials.`,
      )
    }

    for await (const rawDoc of documents()) {
      const doc = rawDoc as OrganizationDoc
      if (isDraft(doc._id)) continue
      if (doc._id !== ORG_ID) continue
      if ((doc.secretEnvSlug ?? '').trim()) {
        console.log(
          `  – ${doc._id}: secretEnvSlug already set to "${doc.secretEnvSlug}" — nothing to do.`,
        )
        continue
      }
      console.log(`  ✓ ${doc._id}: set secretEnvSlug = "${SECRET_ENV_SLUG}"`)
      yield patch(doc._id, [at('secretEnvSlug', set(SECRET_ENV_SLUG))])
    }
  },
})
