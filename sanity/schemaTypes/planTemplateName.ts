import { defineField, defineType } from 'sanity'

/**
 * NAME RESERVATION for organization-owned Plan Templates (Templates spec §2.4:
 * `name` is unique per organization). One document per held name; its id is a
 * hash of the organization and the normalized name, so the `create` that takes
 * a name — in the same transaction as version 1 of a Template, or as the first
 * batch of a rename — fails when someone else holds it. A read-then-write
 * check cannot do that: two organizers racing past it both land.
 *
 * Written only by `src/lib/marketing/plan-templates/sanity.ts`, deleted with
 * the Template or when a rename lets the name go. Hidden from the Studio
 * structure (see `STUDIO_HIDDEN_TYPES`): nobody edits it by hand.
 */
export default defineType({
  name: 'planTemplateName',
  type: 'document',
  title: 'Plan Template name (internal)',
  __experimental_omnisearch_visibility: false,
  fields: [
    defineField({
      name: 'organization',
      type: 'reference',
      to: [{ type: 'organization' }],
      readOnly: true,
    }),
    defineField({ name: 'templateId', type: 'string', readOnly: true }),
    defineField({ name: 'name', type: 'string', readOnly: true }),
  ],
  preview: { select: { title: 'name', subtitle: 'templateId' } },
})
