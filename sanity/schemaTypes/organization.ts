import { defineField, defineType } from 'sanity'

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
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'slug.current',
    },
  },
})
