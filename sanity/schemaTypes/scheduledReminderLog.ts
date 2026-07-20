import { defineField, defineType } from 'sanity'

/**
 * A tiny dedup marker for the scheduled speaker-reminder cron
 * (`src/lib/reminders`). One document tracks that a given reminder `key` was
 * delivered to a given speaker for a given conference, so a daily re-run never
 * double-sends.
 *
 * DETERMINISTIC ID: the document `_id` is derived, not random —
 * `reminder.<key>.<conferenceId>.<speakerId>` for the recurring speaker
 * reminders, and `reminder.day-of.<conferenceId>.<speakerId>.<date>` for the
 * day-of agenda. The cron writes it with `createIfNotExists` + a counter
 * increment, so concurrent runs converge on ONE marker per (key, conference,
 * speaker) instead of stacking duplicates.
 *
 * `count` supports RE-ARMING reminders (e.g. the confirm-talk nudge fires up to
 * a capped number of times, spaced apart): the runner reads `count` and
 * `lastSentAt` to decide whether the cap is reached or the spacing window has
 * elapsed before sending again.
 *
 * This is operational bookkeeping, not user content — it stores only a weak
 * speaker/conference reference and timestamps, and ages out with the conference.
 */
export default defineType({
  name: 'scheduledReminderLog',
  title: 'Scheduled Reminder Log',
  type: 'document',
  fields: [
    defineField({
      name: 'key',
      title: 'Reminder Key',
      type: 'string',
      description:
        'The reminder registry key (e.g. confirm-talk, upload-slides, day-of).',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      // Weak so a conference deletion doesn't orphan-block; the marker is
      // disposable bookkeeping.
      weak: true,
    }),
    defineField({
      name: 'speaker',
      title: 'Speaker',
      type: 'reference',
      to: [{ type: 'speaker' }],
      // Weak so erasing a speaker (GDPR) doesn't orphan-block their deletion.
      weak: true,
    }),
    defineField({
      name: 'count',
      title: 'Send Count',
      type: 'number',
      description:
        'How many times this reminder has been delivered to this speaker for this conference.',
      validation: (Rule) => Rule.min(0).integer(),
    }),
    defineField({
      name: 'lastSentAt',
      title: 'Last Sent At',
      type: 'datetime',
      description: 'When this reminder was last delivered.',
    }),
  ],
  preview: {
    select: {
      key: 'key',
      speaker: 'speaker.name',
      count: 'count',
    },
    prepare({ key, speaker, count }) {
      return {
        title: `${key || 'reminder'} → ${speaker || 'speaker'}`,
        subtitle: `sent ${count ?? 0}×`,
      }
    },
  },
})
