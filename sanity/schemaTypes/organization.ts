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
        slugify: (input) =>
          input.toLowerCase().replace(/\s+/g, '-').slice(0, 96),
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
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'slug.current',
    },
  },
})
