import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'speakerBadge',
  title: 'Speaker Badge',
  type: 'document',
  fields: [
    defineField({
      name: 'badge_id',
      title: 'Badge ID',
      type: 'string',
      description: 'Unique identifier for the badge',
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'speaker',
      title: 'Speaker',
      type: 'reference',
      to: { type: 'speaker' },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: { type: 'conference' },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'badge_type',
      title: 'Badge Type',
      type: 'string',
      options: {
        list: [
          { title: 'Speaker', value: 'speaker' },
          { title: 'Organizer', value: 'organizer' },
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'issued_at',
      title: 'Issued At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'badge_json',
      title: 'Badge JSON',
      type: 'text',
      description: 'OpenBadges v3.0 JSON-LD credential',
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'baked_svg',
      title: 'Baked SVG',
      type: 'file',
      description: 'SVG file with embedded badge metadata',
      options: {
        accept: '.svg,image/svg+xml',
      },
    }),
    defineField({
      name: 'verification_url',
      title: 'Verification URL',
      type: 'url',
      description: 'Public URL for badge verification',
      readOnly: true,
    }),
    defineField({
      name: 'email_sent',
      title: 'Email Sent',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'email_sent_at',
      title: 'Email Sent At',
      type: 'datetime',
    }),
    defineField({
      name: 'email_id',
      title: 'Email ID',
      type: 'string',
      description: 'Resend email ID',
      readOnly: true,
    }),
    defineField({
      name: 'email_error',
      title: 'Email Error',
      type: 'text',
      description: 'Error message if email failed to send',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      speakerName: 'speaker.name',
      badgeType: 'badge_type',
      conferenceName: 'conference.title',
      issuedAt: 'issued_at',
    },
    prepare({ speakerName, badgeType, conferenceName, issuedAt }) {
      return {
        title: `${speakerName} - ${badgeType}`,
        subtitle: `${conferenceName} • ${issuedAt ? new Date(issuedAt).toLocaleDateString() : 'Not issued'}`,
        media: undefined,
      }
    },
  },
  orderings: [
    {
      title: 'Issued Date (newest first)',
      name: 'issuedDateDesc',
      by: [{ field: 'issued_at', direction: 'desc' }],
    },
    {
      title: 'Badge Type',
      name: 'badgeType',
      by: [{ field: 'badge_type', direction: 'asc' }],
    },
  ],
})
