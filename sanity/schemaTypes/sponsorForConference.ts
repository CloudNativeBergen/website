import { defineField, defineType } from 'sanity'
import { CONTACT_ROLE_OPTIONS } from '../../src/lib/sponsor/types'
import {
  closedWonTierError,
  tierExistenceQuery,
} from '../../src/lib/sponsor-crm/tier-validation'
import { contractSentError } from '../../src/lib/sponsor-crm/contract-validation'
import { CURRENCY_OPTIONS } from './constants'
import { apiVersion } from '../env'

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
      // Blocking error: a closed-won sponsor that is effectively untiered
      // is hidden from the public site. "Effectively untiered" covers a missing
      // tier reference AND a dangling one (the tier doc was deleted) — a dangling
      // ref is still a truthy { _ref }, so existence must be checked. Mirrors the
      // tRPC guards for edits made directly in the Studio (which bypass the API).
      validation: (Rule) =>
        Rule.custom((tier, context) => {
          const status = (context.document as { status?: string } | undefined)
            ?.status
          const tierRef = (tier as { _ref?: string } | undefined)?._ref
          const client = context.getClient({ apiVersion })
          return closedWonTierError(status, tierRef, async (ref) => {
            const { query, params } = tierExistenceQuery(ref)
            return client.fetch<boolean>(query, params)
          })
        }),
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
          { title: 'Registration Sent', value: 'registration-sent' },
          { title: 'Contract Sent', value: 'contract-sent' },
          { title: 'Contract Signed', value: 'contract-signed' },
        ],
        layout: 'dropdown',
      },
      initialValue: 'none',
      // Blocking error: a sent/signed contract must carry a tier and a value
      // (the data a valid contract requires). Mirrors the tRPC contract axis
      // guards for Studio edits that bypass the API. Promoted from a warning to
      // a blocking error in #379, after the back-catalog audit.
      validation: (Rule) => [
        Rule.required(),
        Rule.custom((status, context) => {
          const doc = context.document as
            { tier?: { _ref?: string }; contractValue?: number } | undefined
          return contractSentError(
            status as string | undefined,
            doc?.tier?._ref,
            doc?.contractValue,
          )
        }),
      ],
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
      description: 'Agreement ID from the contract signing provider',
      readOnly: true,
    }),
    defineField({
      name: 'signerName',
      title: 'Signer Name',
      type: 'string',
      description: 'Name of the person who should sign the contract',
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
      description: 'Signing URL for the signer',
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
      name: 'organizerSignedAt',
      title: 'Organizer Signed Date',
      type: 'datetime',
      description: 'When the organizer counter-signed the contract',
      readOnly: true,
    }),
    defineField({
      name: 'organizerSignedBy',
      title: 'Organizer Signed By',
      type: 'string',
      description: 'Name of the organizer who counter-signed',
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
      name: 'reminderClaims',
      title: 'Reminder Claims (in flight)',
      type: 'array',
      of: [{ type: 'string' }],
      description:
        'Ids of reminder slots claimed by the reminder cron and not yet settled; a claim is removed when its reminder went out or its slot was given back.',
      readOnly: true,
      hidden: true,
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
              filter: '_id in *[_type == \"conference\"].organizers[]._ref',
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
      name: 'contractSignedBy',
      title: 'Contract Signed By',
      type: 'string',
      readOnly: true,
      description:
        'Name entered by the signer in the digital signing flow. Set only by that flow — its presence proves the stored document is the signed one.',
    }),
    defineField({
      name: 'contractReservedTerms',
      title: 'Contract Agreement Reserved Terms',
      type: 'string',
      description:
        'Fingerprint of the terms (value, currency, tier) the reserved PDF was rendered from; a retry whose terms differ issues a fresh agreement.',
    }),
    defineField({
      name: 'contractReservedInputs',
      title: 'Contract Agreement Reserved Inputs',
      type: 'string',
      description:
        'Hash of every input the reserved PDF was rendered from (sponsor, contact, tier, add-ons, conference, template revision); a retry after any of them changed issues a fresh agreement.',
    }),
    defineField({
      name: 'contractReservedAt',
      title: 'Contract Agreement Reserved At',
      type: 'datetime',
      description:
        'Set while a contract send is in flight (the agreement is stored before the email goes out); cleared once the deal is contract-sent or the send failed.',
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
      validation: (Rule) => [
        Rule.required(),
        Rule.custom((status, context) => {
          const doc = context.document as any
          if (
            status &&
            status !== 'not-sent' &&
            status !== 'cancelled' &&
            doc?.contractStatus !== 'contract-signed'
          ) {
            return 'Invoice is marked as active (sent/paid/overdue), but the contract is not signed.'
          }
          return true
        }),
      ],
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
          name: 'invoiceFormat',
          title: 'Invoice Format',
          type: 'string',
          description: 'How the sponsor prefers to receive invoices',
          options: {
            list: [
              { title: 'EHF (Digital Invoice)', value: 'ehf' },
              { title: 'PDF via Email', value: 'pdf' },
            ],
            layout: 'radio',
          },
          initialValue: 'pdf',
          validation: (Rule) => Rule.required(),
        },
        {
          name: 'email',
          title: 'Billing Email',
          type: 'string',
          description:
            'Required for PDF invoices and as fallback if EHF delivery fails',
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
    defineField({
      // The sponsor↔discount-code link (#1262). The ticketing provider cannot
      // hold it, so it lives here: appended when codes are SENT to the sponsor
      // or ASSIGNED from the discount code manager, and read by every code
      // attribution (`sponsorOwningCode`) in preference to the name heuristic.
      name: 'discountCodes',
      title: 'Discount Codes',
      type: 'array',
      description:
        'Ticket discount codes given to this sponsor. Added by the CRM when codes are sent or assigned; remove an entry here only to undo a mistaken assignment.',
      // NOT readOnly on purpose: the app only ever appends, and a send or an
      // Assign refuses a code stored on another sponsor — so without this,
      // a code assigned to the wrong sponsor could never be moved.
      of: [
        {
          type: 'object',
          name: 'linkedDiscountCode',
          fields: [
            defineField({
              name: 'code',
              title: 'Code',
              type: 'string',
              description: 'The code as the sponsor types it at checkout',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'providerCodeId',
              title: 'Provider Code ID',
              type: 'string',
              description:
                'How the ticketing provider identifies the code (Checkin keys codes by the code itself)',
            }),
            defineField({
              name: 'linkedAt',
              title: 'Linked At',
              type: 'datetime',
            }),
            defineField({
              name: 'linkedVia',
              title: 'Linked Via',
              type: 'string',
              options: {
                list: [
                  { title: 'Sent', value: 'send' },
                  { title: 'Assigned', value: 'assign' },
                  { title: 'Created for the sponsor', value: 'create' },
                  { title: 'Adopted (was matched by name)', value: 'adopt' },
                ],
              },
            }),
          ],
          preview: { select: { title: 'code', subtitle: 'linkedVia' } },
        },
      ],
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
