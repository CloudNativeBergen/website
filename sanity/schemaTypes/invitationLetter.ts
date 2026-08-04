import { defineField, defineType } from 'sanity'

/**
 * Audit trail for issued visa invitation letters.
 *
 * DELIBERATELY holds no passport data. The applicant's passport number, date of
 * birth and nationality are typed by an organizer, rendered straight into the
 * PDF and then dropped — they are never written here, never logged, and the
 * generated PDF is not stored either (it contains the same data). What remains
 * is the minimum needed to answer "did we issue a letter, to whom, and who
 * signed off": name, contact email, the reference printed on the letter, and
 * the issuing organizer.
 *
 * Re-issuing therefore means re-entering the details. That is the intended
 * trade-off: the organizer already holds them in the correspondence the request
 * arrived in, and storing them here would make us the custodian of a passport
 * register with everything that follows.
 */
export default defineType({
  name: 'invitationLetter',
  title: 'Invitation Letter',
  type: 'document',
  // Written only by the issuing endpoint; the Studio view is for auditing.
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
      name: 'reference',
      title: 'Letter Reference',
      type: 'string',
      description: 'The reference printed on the letter itself',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'recipientName',
      title: 'Recipient Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'recipientEmail',
      title: 'Recipient Email',
      type: 'string',
    }),
    defineField({
      name: 'participantRole',
      title: 'Participant Role',
      type: 'string',
      options: {
        list: [
          { title: 'Attendee', value: 'attendee' },
          { title: 'Speaker', value: 'speaker' },
          { title: 'Sponsor representative', value: 'sponsor' },
          { title: 'Organizer', value: 'organizer' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'issuedBy',
      title: 'Issued By',
      type: 'reference',
      to: [{ type: 'speaker' }],
      description: 'The organizer who issued and stands behind the letter',
    }),
    defineField({
      name: 'issuedAt',
      title: 'Issued At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'emailedTo',
      title: 'Emailed To',
      type: 'string',
      description: 'Set when the letter was delivered by email from the app',
    }),
  ],
  preview: {
    select: {
      title: 'recipientName',
      reference: 'reference',
      issuedAt: 'issuedAt',
    },
    prepare({ title, reference, issuedAt }) {
      return {
        title: title || 'Unnamed recipient',
        subtitle: [reference, issuedAt?.slice(0, 10)]
          .filter(Boolean)
          .join(' · '),
      }
    },
  },
  orderings: [
    {
      title: 'Newest first',
      name: 'issuedAtDesc',
      by: [{ field: 'issuedAt', direction: 'desc' }],
    },
  ],
})
