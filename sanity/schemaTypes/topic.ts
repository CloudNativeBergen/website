import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'topic',
  title: 'Talk Topic',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Display name of the topic',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      description: 'Brief explanation of what this topic covers',
    }),
    defineField({
      name: 'color',
      title: 'Color',
      description: 'Color used to visually identify this topic',
      type: 'string',
      validation: (Rule) =>
        Rule.required()
          .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
            name: 'hex color',
            invert: false,
          })
          .error('Must be a valid hex color (e.g., #FF5733 or #F00)'),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'URL-friendly identifier, auto-generated from title',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    // Multi-tenant owner (CaaS T1-1, #613). Additive/optional; populated by the
    // 044 backfill and stamped at creation. Server code must not assume presence.
    defineField({
      name: 'organization',
      title: 'Organization',
      type: 'reference',
      to: [{ type: 'organization' }],
      description: 'The organization (tenant) that owns this topic.',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      color: 'color',
    },
    prepare(selection) {
      const { title, color } = selection
      return {
        title,
        subtitle: color,
      }
    },
  },
})
