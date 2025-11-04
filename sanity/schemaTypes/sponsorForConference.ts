import { defineField, defineType } from 'sanity'

const SPONSOR_TAGS = [
  'warm-lead',
  'returning-sponsor',
  'cold-outreach',
  'referral',
  'high-priority',
  'needs-follow-up',
  'multi-year-potential',
] as const

export default defineType({
  name: 'sponsorForConference',
  title: 'Sponsor for Conference',
  type: 'document',
  fields: [
    defineField({
      name: 'sponsor',
      title: 'Sponsor',
      type: 'reference',
      to: [{ type: 'sponsor' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'tier',
      title: 'Sponsor Tier',
      type: 'reference',
      to: [{ type: 'sponsorTier' }],
      options: {
        filter: ({ document }: { document: any }) => {
          if (!document?.conference?._ref) return {}

          return {
            filter: 'conference._ref == $conferenceId',
            params: { conferenceId: document.conference._ref },
          }
        },
      },
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Prospect', value: 'prospect' },
          { title: 'Contacted', value: 'contacted' },
          { title: 'Negotiating', value: 'negotiating' },
          { title: 'Closed - Won', value: 'closed-won' },
          { title: 'Closed - Lost', value: 'closed-lost' },
        ],
        layout: 'dropdown',
      },
      initialValue: 'prospect',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'assigned_to',
      title: 'Assigned To',
      type: 'reference',
      to: [{ type: 'speaker' }],
      description: 'Organizer responsible for this sponsor relationship',
      options: {
        filter: ({ document }: { document: any }) => {
          if (!document?.conference?._ref) {
            return {
              filter: 'is_organizer == true',
            }
          }

          return {
            filter:
              '_id in *[_type == "conference" && _id == $conferenceId][0].organizers[]._ref',
            params: { conferenceId: document.conference._ref },
          }
        },
      },
    }),
    defineField({
      name: 'contact_initiated_at',
      title: 'Contact Initiated Date',
      type: 'datetime',
      description: 'When first contact was made with this sponsor',
    }),
    defineField({
      name: 'contract_signed_at',
      title: 'Contract Signed Date',
      type: 'datetime',
      description: 'When the sponsorship contract was signed',
    }),
    defineField({
      name: 'contract_value',
      title: 'Contract Value',
      type: 'number',
      description: 'Actual contract value (defaults to tier price)',
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: 'contract_currency',
      title: 'Contract Currency',
      type: 'string',
      options: {
        list: [
          { title: 'Norwegian Krone (NOK)', value: 'NOK' },
          { title: 'US Dollar (USD)', value: 'USD' },
          { title: 'Euro (EUR)', value: 'EUR' },
        ],
        layout: 'dropdown',
      },
      initialValue: 'NOK',
    }),
    defineField({
      name: 'invoice_status',
      title: 'Invoice Status',
      type: 'string',
      options: {
        list: [
          { title: 'Not Sent', value: 'not-sent' },
          { title: 'Sent', value: 'sent' },
          { title: 'Paid', value: 'paid' },
          { title: 'Overdue', value: 'overdue' },
          { title: 'Cancelled', value: 'cancelled' },
        ],
        layout: 'dropdown',
      },
      initialValue: 'not-sent',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'invoice_sent_at',
      title: 'Invoice Sent Date',
      type: 'datetime',
      description: 'When the invoice was sent (auto-populated)',
      readOnly: true,
    }),
    defineField({
      name: 'invoice_paid_at',
      title: 'Invoice Paid Date',
      type: 'datetime',
      description: 'When the invoice was paid (auto-populated)',
      readOnly: true,
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      description: 'Freeform notes about this sponsor relationship',
      rows: 5,
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [
        {
          type: 'string',
          options: {
            list: SPONSOR_TAGS.map((tag) => ({
              title: tag
                .split('-')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' '),
              value: tag,
            })),
          },
        },
      ],
      options: {
        layout: 'tags',
      },
    }),
  ],
  preview: {
    select: {
      sponsorName: 'sponsor.name',
      conferenceName: 'conference.title',
      status: 'status',
      tierTitle: 'tier.title',
    },
    prepare({ sponsorName, conferenceName, status, tierTitle }) {
      return {
        title: sponsorName || 'Unnamed Sponsor',
        subtitle: `${conferenceName || 'No Conference'} - ${status || 'No Status'}${tierTitle ? ` (${tierTitle})` : ''}`,
      }
    },
  },
  orderings: [
    {
      title: 'Status',
      name: 'status',
      by: [{ field: 'status', direction: 'asc' }],
    },
    {
      title: 'Conference',
      name: 'conference',
      by: [
        { field: 'conference.title', direction: 'desc' },
        { field: 'status', direction: 'asc' },
      ],
    },
  ],
})
