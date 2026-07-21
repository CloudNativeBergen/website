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
      name: 'speaker',
      title: 'Organizer',
      type: 'reference',
      to: [{ type: 'speaker' }],
      description:
        'The organizer this layout belongs to. Per-organizer configs carry ' +
        'this reference; the legacy conference-wide doc (no speaker) is kept ' +
        'read-only as the first-visit default and is never written again.',
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
              name: 'widgetId',
              title: 'Widget ID',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'widgetType',
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
              name: 'rowSpan',
              title: 'Row Span',
              type: 'number',
            }),
            defineField({
              name: 'colSpan',
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
      speaker: 'speaker.name',
      preset: 'preset',
    },
    prepare({ conference, speaker, preset }) {
      return {
        title: `Dashboard: ${conference || 'Unknown'}`,
        subtitle: speaker
          ? `${speaker}${preset ? ` — ${preset}` : ''}`
          : `Shared default${preset ? ` — ${preset}` : ''}`,
      }
    },
  },
})
