import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'track',
  title: 'Track',
  type: 'document',
  fields: [
    defineField({
      name: 'number',
      title: 'Number',
      type: 'number',
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
    }),
    // Room?
    defineField({
      name: 'talks',
      title: 'Talks',
      type: 'array',
      description: 'List of talks in this track along with their start times',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'talk',
              title: 'Talk',
              type: 'reference',
              to: [{ type: 'talk' }],
              description: 'Reference to a talk in this track',
            },
            {
              name: 'startTime',
              title: 'Start Time',
              type: 'string',
              description: 'The start time of the talk in HH:mm format',
              validation: (Rule) =>
                Rule.regex(
                  /^([01]\d|2[0-3]):([0-5]\d)$/,
                  {
                    name: 'time',
                    invert: false,
                  }
                ).error('Time must be in the format HH:mm (e.g., 14:30)'),
            },
          ],
          preview: {
            select: {
              title: 'talk.title',
              speaker: 'talk.speaker.name',
              startTime: 'startTime',
              format: 'talk.format',
            },
            prepare({ title, speaker, startTime, format }) {
              return {
                title: `${startTime} - ${format}`,
                subtitle: `${title} (${speaker})`,
              }
            },
          },
        },
      ],
    }),
  ],

  preview: {
    select: {
      number: 'number',
      title: 'title',
      description: 'description',
    },
    prepare(selection) {
      const { number, title, description } = selection
      return {
        ...selection,
        title: `Track ${number}: ${title}`,
        subtitle: description,
      }
    },
  },
})
