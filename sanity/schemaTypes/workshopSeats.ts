import { defineField, defineType } from 'sanity'

/**
 * The seats guard of a workshop (#1344): one document per workshop and
 * conference, with a deterministic id
 * (`workshopSeats-<conference id>-<workshop id>`). Every write that confirms
 * a sign-up or changes the capacity patches it `ifRevisionID` the revision it
 * read, so two of them cannot both commit on the same count. It holds no
 * seats itself; the sign-ups do. See `src/lib/workshop/seats.ts`.
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
      name: 'writes',
      title: 'Writes',
      type: 'number',
      description: 'How many seat-changing writes went through the guard.',
    }),
  ],
  preview: {
    select: { title: 'workshop.title' },
  },
})
