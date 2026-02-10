import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'dashboardConfig',
  title: 'Dashboard Config',
  type: 'document',
  fields: [
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'preset',
      title: 'Preset Name',
      type: 'string',
      description: 'Name of the active dashboard preset',
    }),
    defineField({
      name: 'widgets',
      title: 'Widgets',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'widget_id',
              title: 'Widget ID',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'widget_type',
              title: 'Widget Type',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'title',
              title: 'Title',
              type: 'string',
            }),
            defineField({
              name: 'row',
              title: 'Row',
              type: 'number',
            }),
            defineField({
              name: 'col',
              title: 'Column',
              type: 'number',
            }),
            defineField({
              name: 'row_span',
              title: 'Row Span',
              type: 'number',
            }),
            defineField({
              name: 'col_span',
              title: 'Column Span',
              type: 'number',
            }),
            defineField({
              name: 'config',
              title: 'Widget Config',
              type: 'string',
              description: 'JSON-encoded widget configuration',
            }),
          ],
        },
      ],
    }),
  ],
  preview: {
    select: {
      conference: 'conference.title',
      preset: 'preset',
    },
    prepare({ conference, preset }) {
      return {
        title: `Dashboard: ${conference || 'Unknown'}`,
        subtitle: preset || 'Default',
      }
    },
  },
})
