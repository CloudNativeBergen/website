import { defineField, defineType } from 'sanity'

/**
 * A one-way broadcast from a workshop owner (a `talk` speaker) or an organizer
 * to the workshop's CONFIRMED participants. Announcements are emailed on create
 * (fan-out lives in the `workshop.announce` mutation) AND rendered on the
 * workshop page. There are deliberately NO threads and NO participant replies:
 * participants are WorkOS attendees (id strings), not speaker docs, so there is
 * no authenticated identity to attribute a reply to. See the broadcast rail.
 */
export default defineType({
  name: 'workshopAnnouncement',
  title: 'Workshop Announcement',
  type: 'document',
  fields: [
    defineField({
      name: 'workshop',
      title: 'Workshop',
      type: 'reference',
      to: [{ type: 'talk' }],
      // Mirrors workshopSignup's workshop validation: the reference must resolve
      // to a talk in a workshop format, so a broadcast can never target a normal
      // session.
      validation: (Rule) => [
        Rule.required().error('Workshop reference is required'),
        Rule.custom(async (value, context) => {
          if (!value?._ref) return true
          const client = context.getClient({ apiVersion: '2024-01-01' })
          const workshop = await client.fetch(
            `*[_type == "talk" && _id == $id][0]`,
            { id: value._ref },
          )
          if (!workshop) return 'Workshop not found'
          if (!['workshop_120', 'workshop_240'].includes(workshop.format)) {
            return 'Referenced talk must be a workshop format'
          }
          return true
        }),
      ],
    }),

    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) =>
        Rule.required().error('Conference reference is required'),
    }),

    defineField({
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: [{ type: 'speaker' }],
      // WEAK reference (GDPR house rule): if the authoring speaker is later
      // erased, the announcement survives without a dangling strong ref — the
      // page just shows a generic author name.
      weak: true,
      validation: (Rule) => Rule.required().error('Author is required'),
    }),

    defineField({
      name: 'body',
      title: 'Message',
      type: 'text',
      rows: 6,
      validation: (Rule) => [
        Rule.required().error('Announcement message is required'),
        Rule.max(2000).error('Announcement must be 2000 characters or fewer'),
      ],
    }),

    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      readOnly: true,
      validation: (Rule) =>
        Rule.required().error('Created timestamp is required'),
    }),
  ],

  orderings: [
    {
      title: 'Newest first',
      name: 'createdAtDesc',
      by: [{ field: 'createdAt', direction: 'desc' }],
    },
  ],

  preview: {
    select: {
      workshopTitle: 'workshop.title',
      createdAt: 'createdAt',
      body: 'body',
    },
    prepare(selection) {
      const { workshopTitle, createdAt, body } = selection
      const date = createdAt ? new Date(createdAt).toLocaleDateString() : ''
      return {
        title: workshopTitle || 'Unknown Workshop',
        subtitle: [date, body].filter(Boolean).join(' • '),
      }
    },
  },
})
