import { defineField, defineType } from 'sanity'
import {
  SECRET_ENV_SLUG_MAX_LENGTH,
  secretEnvSlugProblem,
} from '../lib/secretEnvSlug'

/**
 * The multi-tenant ORGANIZATION (CaaS tier 1, issue #613).
 *
 * An `organization` is the top-level tenant that OWNS a set of conference
 * editions and all the documents scoped to them. It is the anchor the
 * document-level security model (issue #614) and query scoping (issue #616)
 * build on: every tenant-scoped document carries a (possibly denormalized)
 * `organization` reference back to exactly one of these.
 *
 * SCOPE (T1-1): this document is intentionally LEAN — identity + branding +
 * contact, plus the entitlement pair below (`plan` + `featureOverrides`, the
 * feature-entitlements foundation). Billing mechanics (invoicing, payment
 * state) still arrive with the billing issue; do not add them here
 * speculatively.
 */
export default defineType({
  name: 'organization',
  title: 'Organization',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Display name of the organization (the tenant).',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Stable URL-friendly identifier for the organization.',
      options: {
        source: 'name',
        maxLength: 96,
        // Same normalization as the 044 backfill migration's slugify — strip
        // punctuation and edge dashes, not just whitespace.
        slugify: (input) =>
          input
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 96),
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'contactEmail',
      title: 'Contact Email',
      type: 'string',
      description: 'Primary contact address for the organization.',
      validation: (Rule) => Rule.email(),
    }),
    defineField({
      name: 'billingEmail',
      title: 'Billing Email',
      type: 'string',
      description:
        'Optional address for billing correspondence. Falls back to the contact email when unset.',
      validation: (Rule) => Rule.email(),
    }),
    defineField({
      name: 'homepage',
      title: 'Homepage',
      type: 'url',
      description: 'Optional public homepage for the organization.',
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'inlineSvg',
      description:
        'Optional inline SVG logo for the organization (same mechanism as conference branding).',
    }),
    // Feature entitlements: the plan sets the baseline of GA features; the
    // overrides are explicit per-feature grants/denials that always win over
    // the plan. Resolution semantics live in `src/lib/features/registry.ts` +
    // `entitlements.ts`. ABSENT plan resolves to `community`, so legacy orgs
    // are unaffected without a migration.
    defineField({
      name: 'plan',
      title: 'Plan',
      type: 'string',
      description:
        'Commercial tier of this organization. Determines which generally-available features are enabled by default; leave unset to default to Community.',
      options: {
        list: [
          { title: 'Community', value: 'community' },
          { title: 'Pro', value: 'pro' },
          { title: 'Enterprise', value: 'enterprise' },
        ],
        layout: 'radio',
      },
      initialValue: 'community',
    }),
    defineField({
      name: 'featureOverrides',
      title: 'Feature Overrides',
      type: 'array',
      description:
        'Explicit per-feature grants or denials that take precedence over the plan (beta/internal opt-ins, pilot grants, temporary revocations). Feature ids must match the code registry in src/lib/features/registry.ts; overrides past their expiry are ignored.',
      of: [
        {
          type: 'object',
          name: 'featureOverride',
          title: 'Feature Override',
          fields: [
            defineField({
              name: 'feature',
              title: 'Feature',
              type: 'string',
              description:
                'Feature id from the code registry (e.g. "graphql-api").',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'enabled',
              title: 'Enabled',
              type: 'boolean',
              description:
                'On grants the feature regardless of plan; off revokes it regardless of plan.',
              initialValue: true,
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'note',
              title: 'Note',
              type: 'string',
              description:
                'Optional audit note — why this override exists (e.g. "beta cohort 2").',
            }),
            defineField({
              name: 'expiresAt',
              title: 'Expires At',
              type: 'datetime',
              description:
                'Optional expiry; after this instant the override is ignored entirely.',
            }),
          ],
          preview: {
            select: {
              title: 'feature',
              enabled: 'enabled',
              note: 'note',
            },
            prepare({ title, enabled, note }) {
              return {
                title: `${title ?? '(unset)'} — ${enabled ? 'enabled' : 'disabled'}`,
                subtitle: note,
              }
            },
          },
        },
      ],
    }),
    // Legal identity (go-live gate G2, #643): drives the tenant's /privacy and
    // /terms pages. ABSENT resolves to Norway + Datatilsynet (the existing
    // tenant's values), so legacy orgs are unaffected. Set these for tenants
    // governed by another country's law.
    defineField({
      name: 'legalJurisdiction',
      title: 'Legal Jurisdiction (Country)',
      type: 'string',
      description:
        'Country whose law governs your Terms of Service and whose accounting/tax law is referenced on the Privacy page (e.g. "Norway", "Germany"). Leave blank to default to the conference country, then Norway. When this is not Norway, the Privacy page renders neutral, non-Norway-specific legal prose.',
    }),
    defineField({
      name: 'supervisoryAuthority',
      title: 'Data Protection Supervisory Authority',
      type: 'object',
      description:
        'The data protection authority a complaint can be lodged with. Leave blank to default to the Norwegian Data Protection Authority (Datatilsynet) for Norway, or a neutral "your national data protection authority" pointer elsewhere.',
      fields: [
        defineField({
          name: 'name',
          title: 'Authority Name',
          type: 'string',
        }),
        defineField({
          name: 'url',
          title: 'Website',
          type: 'url',
        }),
        defineField({
          name: 'email',
          title: 'Contact Email',
          type: 'string',
          validation: (Rule) => Rule.email(),
        }),
      ],
    }),
    // ── OPERATOR-ONLY, EFFECTIVELY IMMUTABLE ────────────────────────────────
    //
    // Names this tenant's discrete credential environment variables
    // (`TENANT_<SLUG>_<FAMILY>_<FIELD>`). See `sanity/lib/secretEnvSlug.ts` for
    // the vocabulary and `docs/TENANT_SECRETS.md` for the runbook.
    //
    // WHY IT IS NOT SELF-SERVICE, AND WHY CHANGING IT IS REFUSED. The env vars
    // themselves live in Vercel and are set at DEPLOY time. Change this value
    // and the variables do not follow: `TENANT_<newslug>_EMAIL_API_KEY` simply
    // does not exist, so the tenant's own credentials stop resolving. That
    // failure is SILENT by nature — nothing throws, a lookup just finds
    // nothing. The organization `slug` above taught this lesson the expensive
    // way (RunKonf/platform#43: platform-operator standing was derived from it,
    // an org rename locked the platform out), and this field is the same shape
    // with a quieter blast radius, so it gets the same treatment:
    //
    //   1. kontroll (my.konf.app, the self-service control panel) cannot write
    //      it. Its ONE organization write is a three-key allowlist
    //      (`updateOrganization` in `src/lib/portal/sanity.ts`) and its Sanity
    //      partition grants `organization` nothing but `patch`. Verified
    //      against kontroll@dd20c17; re-verify before widening that allowlist.
    //   2. This repo never writes it either — `platform.updateEntitlements`
    //      sets `plan`/`featureOverrides` only, and the provisioning API
    //      accepts a fixed four-field organization body.
    //   3. `readOnly` below locks the input once a value is present, and the
    //      validation rule refuses a CHANGE to a non-empty published value even
    //      if the input is bypassed (Vision, a script driving the Studio).
    //
    // ESCAPE HATCH for a genuine correction (a typo caught before the env vars
    // are set, or a deliberate re-key): unset the field with a `migrations/`
    // migration or `sanity documents` against production, then set the new
    // value. Both controls key on the PUBLISHED value being non-empty, so a
    // cleared field is editable again. Do it in the same sitting as renaming
    // the Vercel variables; in between, the tenant resolves no credentials.
    //
    // NOTE — validation runs in the STUDIO ONLY. It is a review control, not a
    // security boundary: a holder of a Sanity write token can patch any field.
    // What actually keeps this field operator-only is (1) and (2) above.
    defineField({
      name: 'secretEnvSlug',
      title: 'Secret Env Var Slug (operator only)',
      type: 'string',
      description:
        'OPERATOR ONLY. Opaque uppercase label naming this tenant’s credential environment variables (TENANT_<SLUG>_EMAIL_API_KEY and friends). NOT the organization slug above, and not a customer-facing value. Set once, at provisioning time, together with the variables themselves — changing it orphans them and the tenant silently stops using its own credentials. Leave blank for every tenant that has no discrete credential variables.',
      readOnly: ({ value }) =>
        typeof value === 'string' && value.trim().length > 0,
      validation: (Rule) =>
        Rule.max(SECRET_ENV_SLUG_MAX_LENGTH).custom(async (value, context) => {
          // ABSENT is the norm and is always fine: it means "this tenant has no
          // discrete credential variables", which is every tenant but one.
          if (value === undefined || value === null || value === '') return true

          const problem = secretEnvSlugProblem(value)
          if (problem) return `Secret env var slug ${problem}.`

          const documentId = (context.document?._id ?? '').replace(
            /^drafts\./,
            '',
          )
          if (!documentId) return true
          const client = context.getClient({ apiVersion: '2024-08-01' })

          const [published, clash] = await Promise.all([
            // IMMUTABILITY is decided against the PUBLISHED document, not the
            // draft: the draft already carries whatever was just typed, so
            // comparing against it would always agree with itself.
            client.fetch<string | null>(`*[_id == $id][0].secretEnvSlug`, {
              id: documentId,
            }),
            // UNIQUENESS. Two organizations sharing a slug would read the SAME
            // variables — a cross-tenant credential leak by typo. This is the
            // editor-facing half; the resolver enforces it again at read time
            // (and refuses BOTH orgs), because a Studio rule cannot see a
            // document written by anything other than the Studio.
            client.fetch<string | null>(
              `*[_type == "organization" && secretEnvSlug == $value && !(_id in [$id, $draftId])][0]._id`,
              { value, id: documentId, draftId: `drafts.${documentId}` },
            ),
          ])

          if (published && published !== value) {
            return `Secret env var slug is set once and cannot be changed here (currently "${published}"). The TENANT_${published}_* environment variables are named after it and would be orphaned. To re-key this tenant, unset the field with a migration first — see docs/TENANT_SECRETS.md.`
          }
          if (clash) {
            return `Secret env var slug "${value}" is already used by ${clash}. Two organizations sharing one slug would read the same credentials.`
          }
          return true
        }),
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'slug.current',
    },
  },
})
