import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'speakerBadge',
  title: 'Speaker Badge',
  type: 'document',
  fields: [
    defineField({
      name: 'badgeId',
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
      name: 'badgeType',
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
      name: 'issuedAt',
      title: 'Issued At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'badgeJson',
      title: 'Badge JSON',
      type: 'text',
      description: 'OpenBadges v3.0 JSON-LD credential',
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'bakedSvg',
      title: 'Baked SVG',
      type: 'file',
      description: 'SVG file with embedded badge metadata',
      options: {
        accept: '.svg,image/svg+xml',
      },
    }),
    defineField({
      name: 'verificationUrl',
      title: 'Verification URL',
      type: 'url',
      description: 'Public URL for badge verification',
      readOnly: true,
    }),
    defineField({
      name: 'emailSent',
      title: 'Email Sent',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'emailSentAt',
      title: 'Email Sent At',
      type: 'datetime',
    }),
    defineField({
      name: 'emailId',
      title: 'Email ID',
      type: 'string',
      description: 'Resend email ID',
      readOnly: true,
    }),
    defineField({
      name: 'emailError',
      title: 'Email Error',
      type: 'text',
      description: 'Error message if email failed to send',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      speakerName: 'speaker.name',
      badgeType: 'badgeType',
      conferenceName: 'conference.title',
      issuedAt: 'issuedAt',
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
      by: [{ field: 'issuedAt', direction: 'desc' }],
    },
    {
      title: 'Badge Type',
      name: 'badgeType',
      by: [{ field: 'badgeType', direction: 'asc' }],
    },
  ],
})
