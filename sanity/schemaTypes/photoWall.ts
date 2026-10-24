import { defineField, defineType } from 'sanity'
import { postingModeOf, type PostingMode } from '@/lib/photo-wall/types'

/** The switch's labels; a missing mode is Automatic (§7). */
const POSTING_LABELS: Record<PostingMode, string> = {
  auto: 'Automatic',
  open: 'Open',
  paused: 'Paused',
}

/**
 * A conference's Photo Wall (Photo Wall spec §4.1), one per conference with
 * the id `photoWall-<conferenceId>`. A conference without one has no Photo
 * Wall: the `/wall` routes 404. Created by Set up the Photo Wall on
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
      description:
        'Automatic opens posting at 00:00 on the conference’s first day and closes it at the end of its last (Oslo time). A missing value reads as Automatic.',
      type: 'string',
      options: {
        list: [
          { title: 'Automatic', value: 'auto' },
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
      // The read's rule: missing is Automatic, anything unknown Paused.
      subtitle: POSTING_LABELS[postingModeOf(mode)],
    }),
  },
})
