import { defineField, defineType } from 'sanity'

/**
 * The seats guard of a workshop (#1344): one document per workshop and
 * conference, with a deterministic id
 * (`workshopSeats-<hash of conference and workshop id>`). Every write that confirms
 * a sign-up or changes the capacity patches it `ifRevisionID` the revision it
 * read, so two of them cannot both commit on the same count. The sign-ups
 * hold the seats; the guard remembers only the last fifteen minutes of what
 * it let through, for reads that do not show it yet. See
 * `src/lib/workshop/seats.ts`.
 */
export default defineType({
  name: 'workshopSeats',
  title: 'Workshop Seats Guard',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({
      name: 'workshop',
      title: 'Workshop',
      type: 'reference',
      to: [{ type: 'talk' }],
      // Weak: the guard must not keep a workshop from being deleted.
      weak: true,
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      weak: true,
    }),
    defineField({
      name: 'recent',
      title: 'Seats taken a moment ago',
      description:
        'Counted beside the sign-ups for fifteen minutes, while a read may not show them yet.',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'recentSeat',
          fields: [
            { name: 'signup', title: 'Sign-up id', type: 'string' },
            { name: 'at', title: 'At', type: 'datetime' },
          ],
        },
      ],
    }),
    defineField({
      name: 'writes',
      title: 'Writes',
      type: 'number',
      description:
        'How many seat-changing writes went through the guard. Raised on every one, so each changes the document and gives it a new revision, even when nothing else in it changes.',
    }),
  ],
  preview: {
    select: { title: 'workshop.title' },
  },
})
