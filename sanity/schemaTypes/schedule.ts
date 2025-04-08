import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'schedule',
  title: 'Schedule',
  type: 'document',
  fields: [
    defineField({
      name: 'date',
      title: 'Date',
      type: 'date',
    }),
    defineField({
      name: 'time_start',
      title: 'Start Time',
      type: 'string',
      deprecated: {
        reason: 'This field is no longer used',
      },
    }),
    defineField({
      name: 'time_end',
      title: 'End Time',
      type: 'string',
      deprecated: {
        reason: 'This field is no longer used',
      },
    }),
    defineField({
      name: 'tracks',
      title: 'Scheduled Tracks',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'track',
          fields: [
            {
              name: 'trackTitle',
              title: 'Track Title',
              type: 'string',
            },
            {
              name: 'trackDescription',
              title: 'Track Description',
              type: 'text',
              rows: 3,
            },
            {
              name: 'talks',
              title: 'Talks',
              type: 'array',
              of: [
                {
                  type: 'object',
                  name: 'scheduledTalk',
                  fields: [
                    {
                      name: 'talk',
                      title: 'Talk',
                      type: 'reference',
                      to: { type: 'talk' },
                    },
                    {
                      name: 'startTime',
                      title: 'Start Time',
                      type: 'string',
                      validation: (Rule) =>
                        Rule.regex(
                          /^([01]\d|2[0-3]):([0-5]\d)$/,
                          {
                            name: 'time',
                            invert: false,
                          }
                        ).error('Time must be in the format HH:mm (e.g., 14:30)'),
                    },
                    {
                      name: 'endTime',
                      title: 'End Time',
                      type: 'string',
                      validation: (Rule) =>
                        Rule.regex(
                          /^([01]\d|2[0-3]):([0-5]\d)$/,
                          {
                            name: 'time',
                            invert: false,
                          }
                        ).error('Time must be in the format HH:mm (e.g., 14:30)'),
                    }
                  ],
                  preview: {
                    select: {
                      title: 'talk.title',
                      speaker: 'talk.speaker.name',
                      startTime: 'startTime',
                      endTime: 'endTime',
                      format: 'talk.format',
                    },
                    prepare({ title, speaker, startTime, endTime, format }) {
                      return {
                        title: `${startTime} - ${endTime} (${format})`,
                        subtitle: `${title} (${speaker})`,
                      }
                    }
                  }
                }
              ],
            }
          ],
          preview: {
            select: {
              title: 'trackTitle',
              talks: 'talks',
            },
            prepare({ title, talks }) {
              const talkStarTimes = talks?.map((item: { startTime: string }) => item.startTime).join(', ');
              return {
                title: title,
                subtitle: `${talks.length} talk(s) - ${talkStarTimes}`,
              }
            }
          }
        }
      ],
    }),
    defineField({
      name: 'track',
      title: 'Track',
      type: 'reference',
      to: { type: 'track' },
      deprecated: {
        reason: 'Use scheduledTracks instead',
      },
    }),
    defineField({
      name: 'talk',
      title: 'Talk',
      type: 'reference',
      to: { type: 'talk' },
      deprecated: {
        reason: 'This field is no longer used',
      },
    }),
  ],

  preview: {
    select: {
      date: 'date',
      tracks: 'tracks',
    },
    prepare(selection) {
      const { date, tracks } = selection;
      const trackCount = tracks?.length || 0;
      return {
        title: `${date} - ${trackCount} track(s)`,
        subtitle: `Schedule with embedded tracks and talks`,
      }
    },
  },
})
