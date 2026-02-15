import { defineField, defineType } from 'sanity'
import { CONTACT_ROLE_OPTIONS } from '../../src/lib/sponsor/types'
import { CURRENCY_OPTIONS } from './constants'

const SPONSOR_TAGS = [
  'warm-lead',
  'returning-sponsor',
  'cold-outreach',
  'referral',
  'high-priority',
  'needs-follow-up',
  'multi-year-potential',
  'previously-declined',
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
      name: 'addons',
      title: 'Add-ons',
      type: 'array',
      description: 'Additional purchasable items (e.g., booth upgrades)',
      of: [
        {
          type: 'reference',
          to: [{ type: 'sponsorTier' }],
          options: {
            filter: ({ document }: { document: any }) => {
              if (!document?.conference?._ref) return {}

              return {
                filter:
                  'conference._ref == $conferenceId && tierType == "addon"',
                params: { conferenceId: document.conference._ref },
              }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'contractStatus',
      title: 'Contract Status',
      type: 'string',
      options: {
        list: [
          { title: 'None', value: 'none' },
          { title: 'Verbal Agreement', value: 'verbal-agreement' },
          { title: 'Contract Sent', value: 'contract-sent' },
          { title: 'Contract Signed', value: 'contract-signed' },
        ],
        layout: 'dropdown',
      },
      initialValue: 'none',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'signatureStatus',
      title: 'Signature Status',
      type: 'string',
      description: 'Digital signature status from e-signing provider',
      options: {
        list: [
          { title: 'Not Started', value: 'not-started' },
          { title: 'Pending', value: 'pending' },
          { title: 'Signed', value: 'signed' },
          { title: 'Rejected', value: 'rejected' },
          { title: 'Expired', value: 'expired' },
        ],
        layout: 'dropdown',
      },
      initialValue: 'not-started',
    }),
    defineField({
      name: 'signatureId',
      title: 'Signature ID',
      type: 'string',
      description: 'Agreement ID from Adobe Acrobat Sign',
      readOnly: true,
    }),
    defineField({
      name: 'signerEmail',
      title: 'Signer Email',
      type: 'string',
      description: 'Email of the person who should sign the contract',
    }),
    defineField({
      name: 'signingUrl',
      title: 'Signing URL',
      type: 'string',
      description: 'Adobe Sign signing URL for the signer',
      readOnly: true,
    }),
    defineField({
      name: 'contractSentAt',
      title: 'Contract Sent Date',
      type: 'datetime',
      description: 'When the contract was sent for signing',
      readOnly: true,
    }),
    defineField({
      name: 'contractDocument',
      title: 'Contract Document',
      type: 'file',
      description: 'Generated PDF contract document',
      options: {
        accept: 'application/pdf',
      },
    }),
    defineField({
      name: 'reminderCount',
      title: 'Reminder Count',
      type: 'number',
      description: 'Number of contract signing reminders sent',
      initialValue: 0,
      readOnly: true,
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: 'contractTemplate',
      title: 'Contract Template',
      type: 'reference',
      to: [{ type: 'contractTemplate' }],
      description: 'Template used to generate the contract',
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
      name: 'assignedTo',
      title: 'Assigned To',
      type: 'reference',
      to: [{ type: 'speaker' }],
      description: 'Organizer responsible for this sponsor relationship',
      options: {
        filter: ({ document }: { document: any }) => {
          if (!document?.conference?._ref) {
            return {
              filter: 'isOrganizer == true',
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
      name: 'contactInitiatedAt',
      title: 'Contact Initiated Date',
      type: 'datetime',
      description: 'When first contact was made with this sponsor',
    }),
    defineField({
      name: 'contractSignedAt',
      title: 'Contract Signed Date',
      type: 'datetime',
      description: 'When the sponsorship contract was signed',
    }),
    defineField({
      name: 'contractValue',
      title: 'Contract Value',
      type: 'number',
      description: 'Actual contract value (defaults to tier price)',
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: 'contractCurrency',
      title: 'Contract Currency',
      type: 'string',
      options: {
        list: [...CURRENCY_OPTIONS],
        layout: 'dropdown',
      },
      initialValue: 'NOK',
    }),
    defineField({
      name: 'invoiceStatus',
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
      name: 'invoiceSentAt',
      title: 'Invoice Sent Date',
      type: 'datetime',
      description: 'When the invoice was sent (auto-populated)',
      readOnly: true,
    }),
    defineField({
      name: 'invoicePaidAt',
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
    defineField({
      name: 'contactPersons',
      title: 'Contact Persons',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'contactPerson',
          title: 'Contact Person',
          fields: [
            {
              name: 'name',
              title: 'Name',
              type: 'string',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'email',
              title: 'Email',
              type: 'string',
              validation: (Rule) =>
                Rule.required().email().error('Please enter a valid email'),
            },
            {
              name: 'phone',
              title: 'Phone',
              type: 'string',
            },
            {
              name: 'role',
              title: 'Role',
              type: 'string',
              description: "Select the contact person's role",
              options: {
                list: CONTACT_ROLE_OPTIONS.map((role) => ({
                  title: role,
                  value: role,
                })),
                layout: 'dropdown',
              },
            },
            {
              name: 'isPrimary',
              title: 'Primary Contact',
              type: 'boolean',
              description:
                'Designate as the primary contact for this sponsorship',
              initialValue: false,
            },
          ],
          preview: {
            select: {
              title: 'name',
              subtitle: 'role',
              description: 'email',
            },
          },
        },
      ],
      hidden: ({ currentUser }) => {
        return !(
          currentUser != null &&
          currentUser.roles.find(
            ({ name }) => name === 'administrator' || name === 'editor',
          )
        )
      },
    }),
    defineField({
      name: 'billing',
      title: 'Billing Information',
      type: 'object',
      fields: [
        {
          name: 'email',
          title: 'Billing Email',
          type: 'string',
          validation: (Rule) =>
            Rule.required().email().error('Please enter a valid email'),
        },
        {
          name: 'reference',
          title: 'Billing Reference',
          type: 'string',
          description: 'Purchase order number, reference code, etc.',
        },
        {
          name: 'comments',
          title: 'Billing Comments',
          type: 'text',
          description: 'Additional billing instructions or notes',
        },
      ],
      hidden: ({ currentUser }) => {
        return !(
          currentUser != null &&
          currentUser.roles.find(
            ({ name }) => name === 'administrator' || name === 'editor',
          )
        )
      },
    }),
    defineField({
      name: 'registrationToken',
      title: 'Registration Token',
      type: 'string',
      description: 'Unique token for sponsor self-service registration portal',
      readOnly: true,
    }),
    defineField({
      name: 'registrationComplete',
      title: 'Registration Complete',
      type: 'boolean',
      description: 'Whether the sponsor has completed registration',
      initialValue: false,
      readOnly: true,
    }),
    defineField({
      name: 'registrationCompletedAt',
      title: 'Registration Completed At',
      type: 'datetime',
      description: 'When the sponsor completed registration',
      readOnly: true,
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
      title: 'Status and Sponsor',
      name: 'statusAndSponsor',
      by: [{ field: 'status', direction: 'asc' }],
    },
  ],
})
