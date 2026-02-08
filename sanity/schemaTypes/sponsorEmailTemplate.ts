import { defineField, defineType } from 'sanity'

export const TEMPLATE_CATEGORY_OPTIONS = [
  { title: 'Cold Outreach', value: 'cold-outreach' },
  { title: 'Returning Sponsor', value: 'returning-sponsor' },
  { title: 'International Sponsor', value: 'international' },
  { title: 'Local / Community', value: 'local-community' },
  { title: 'Follow-up', value: 'follow-up' },
  { title: 'Custom', value: 'custom' },
] as const

export const TEMPLATE_LANGUAGE_OPTIONS = [
  { title: 'Norwegian', value: 'no' },
  { title: 'English', value: 'en' },
] as const

export default defineType({
  name: 'sponsorEmailTemplate',
  title: 'Sponsor Email Template',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Template Name',
      type: 'string',
      description: 'Internal label for this template (e.g. "Cold Outreach")',
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Stable identifier for programmatic reference',
      options: {
        source: 'title',
        slugify: (input) =>
          input.toLowerCase().replace(/\s+/g, '-').slice(0, 96),
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [...TEMPLATE_CATEGORY_OPTIONS],
        layout: 'dropdown',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'language',
      title: 'Language',
      type: 'string',
      options: {
        list: [...TEMPLATE_LANGUAGE_OPTIONS],
        layout: 'radio',
      },
      initialValue: 'no',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'subject',
      title: 'Email Subject',
      type: 'string',
      description:
        'Supports variables: {{{SPONSOR_NAME}}}, {{{CONFERENCE_TITLE}}}, etc.',
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'body',
      title: 'Email Body',
      type: 'blockContent',
      description:
        'Rich text email body. Use {{{VARIABLE}}} syntax for dynamic values.',
    }),
    defineField({
      name: 'description',
      title: 'Internal Notes',
      type: 'text',
      description: 'When to use this template (not shown in emails)',
      rows: 2,
    }),
    defineField({
      name: 'is_default',
      title: 'Default Template',
      type: 'boolean',
      description: 'Show this template as the default for its category',
      initialValue: false,
    }),
    defineField({
      name: 'sort_order',
      title: 'Sort Order',
      type: 'number',
      description: 'Controls ordering in the template picker (lower = first)',
      initialValue: 0,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      category: 'category',
      language: 'language',
      isDefault: 'is_default',
    },
    prepare({ title, category, language, isDefault }) {
      const categoryLabel =
        TEMPLATE_CATEGORY_OPTIONS.find((c) => c.value === category)?.title ||
        category
      const langLabel =
        TEMPLATE_LANGUAGE_OPTIONS.find((l) => l.value === language)?.title ||
        language
      return {
        title: `${title}${isDefault ? ' ★' : ''}`,
        subtitle: `${categoryLabel} · ${langLabel || 'No language'}`,
      }
    },
  },
  orderings: [
    {
      title: 'Category, then Sort Order',
      name: 'categorySort',
      by: [
        { field: 'category', direction: 'asc' },
        { field: 'sort_order', direction: 'asc' },
      ],
    },
  ],
})
