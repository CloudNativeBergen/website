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
 * contact only. Billing/plan fields arrive with the billing issue; do not add
 * them here speculatively.
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
