import { defineField, defineType } from 'sanity'

/**
 * A conference's Photo Wall (Photo Wall spec §4.1), one per conference with
 * the id `photoWall-<conferenceId>`. A conference without one has no Photo
 * Wall: the `/wall` routes 404. Created paused by Set up the Photo Wall on
 * `/admin/photo-wall`, where organizers change it; read-only here.
 */
export default defineType({
  name: 'photoWall',
  title: 'Photo Wall',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'postingMode',
      title: 'Posting',
      description: 'A missing value reads as Paused.',
      type: 'string',
      options: {
        list: [
          { title: 'Open', value: 'open' },
          { title: 'Paused', value: 'paused' },
        ],
      },
    }),
    defineField({
      name: 'sponsorStrip',
      title: 'Sponsor strip',
      description: 'Screen Mode shows the sponsor strip.',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'look',
      title: 'Wall Look',
      description: 'A missing value reads as Pinboard.',
      type: 'string',
      options: {
        list: [
          { title: 'Pinboard', value: 'pinboard' },
          { title: 'Mosaic', value: 'mosaic' },
          { title: 'Spotlight', value: 'spotlight' },
        ],
      },
    }),
    defineField({
      name: 'closedAt',
      title: 'Closed at',
      description: 'Set by the retention cron: the wall is closed to writes.',
      type: 'datetime',
    }),
    defineField({
      name: 'purgedAt',
      title: 'Purged at',
      description: 'Set by the retention cron once every post is deleted.',
      type: 'datetime',
    }),
  ],
  preview: {
    select: { title: 'conference.title', mode: 'postingMode' },
    prepare: ({ title, mode }) => ({
      title: title ? `Photo Wall: ${title}` : 'Photo Wall',
      subtitle: mode === 'open' ? 'Open' : 'Paused',
    }),
  },
})
