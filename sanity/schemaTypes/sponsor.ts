import { defineField, defineType } from 'sanity'
import { CONTACT_ROLE_OPTIONS } from '../../src/lib/sponsor/types'

export default defineType({
  name: 'sponsor',
  title: 'Sponsor',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'website',
      title: 'Website',
      type: 'url',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'inlineSvg',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'org_number',
      title: 'Organization Number',
      type: 'string',
      description: 'Company registration number or organization number',
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
      name: 'contact_persons',
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
      name: 'invoice',
      title: 'Invoice Information',
      type: 'object',
      fields: [
        {
          name: 'status',
          title: 'Invoice Status',
          type: 'string',
          options: {
            list: [
              { title: 'Pending', value: 'pending' },
              { title: 'Sent', value: 'sent' },
              { title: 'Paid', value: 'paid' },
              { title: 'Overdue', value: 'overdue' },
              { title: 'Cancelled', value: 'cancelled' },
              { title: 'Partial', value: 'partial' },
            ],
            layout: 'dropdown',
          },
          initialValue: 'pending',
        },
        {
          name: 'date',
          title: 'Invoice Date',
          type: 'date',
          description: 'Date when the invoice was created/sent',
        },
        {
          name: 'due_date',
          title: 'Due Date',
          type: 'date',
          description: 'Payment due date',
        },
        {
          name: 'their_ref',
          title: 'Their Reference',
          type: 'string',
          description: 'Client PO number or reference',
        },
        {
          name: 'our_ref',
          title: 'Our Reference',
          type: 'string',
          description: 'Our invoice number or reference',
        },
        {
          name: 'amount',
          title: 'Invoice Amount',
          type: 'number',
          description: 'Actual invoiced amount (may differ from tier price)',
        },
        {
          name: 'currency',
          title: 'Currency',
          type: 'string',
          initialValue: 'NOK',
          options: {
            list: [
              { title: 'Norwegian Krone (NOK)', value: 'NOK' },
              { title: 'Euro (EUR)', value: 'EUR' },
              { title: 'US Dollar (USD)', value: 'USD' },
              { title: 'British Pound (GBP)', value: 'GBP' },
            ],
            layout: 'dropdown',
          },
        },
        {
          name: 'notes',
          title: 'Invoice Notes',
          type: 'text',
          description: 'Additional notes about the invoice',
        },
        {
          name: 'payment_terms',
          title: 'Payment Terms',
          type: 'string',
          description: 'e.g., "Net 30", "Due on receipt"',
        },
        {
          name: 'payment_date',
          title: 'Payment Date',
          type: 'date',
          description: 'Date when payment was received',
        },
        {
          name: 'payment_method',
          title: 'Payment Method',
          type: 'string',
          description: 'Bank transfer, card, etc.',
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
      name: 'relationship',
      title: 'Sponsor Relationship',
      type: 'object',
      description: 'Comprehensive sponsor lifecycle tracking',
      fields: [
        {
          name: 'status',
          title: 'Current Status',
          type: 'string',
          options: {
            list: [
              { title: 'Potential Lead', value: 'potential' },
              { title: 'Contacted', value: 'contacted' },
              { title: 'In Discussion', value: 'in_discussion' },
              { title: 'Proposal Sent', value: 'proposal_sent' },
              { title: 'Awaiting Decision', value: 'awaiting_decision' },
              { title: 'Verbally Committed', value: 'verbal_commitment' },
              { title: 'Contract Sent', value: 'contract_sent' },
              { title: 'Under Legal Review', value: 'under_review' },
              { title: 'Contract Negotiation', value: 'negotiation' },
              { title: 'Confirmed', value: 'confirmed' },
              { title: 'Materials Needed', value: 'materials_needed' },
              { title: 'Materials Received', value: 'materials_received' },
              { title: 'Ready to Invoice', value: 'ready_to_invoice' },
              { title: 'Invoiced', value: 'invoiced' },
              { title: 'Payment Due', value: 'payment_due' },
              { title: 'Overdue', value: 'overdue' },
              { title: 'Paid', value: 'paid' },
              { title: 'Services Delivered', value: 'delivered' },
              { title: 'Relationship Complete', value: 'completed' },
              { title: 'No Response', value: 'no_response' },
              { title: 'Not Interested', value: 'not_interested' },
              { title: 'Declined', value: 'declined' },
              { title: 'Cancelled', value: 'cancelled' },
            ],
          },
        },
        {
          name: 'status_history',
          title: 'Status History',
          type: 'array',
          of: [
            {
              type: 'object',
              fields: [
                {
                  name: 'status',
                  title: 'Status',
                  type: 'string',
                },
                {
                  name: 'date',
                  title: 'Date',
                  type: 'datetime',
                },
                {
                  name: 'notes',
                  title: 'Notes',
                  type: 'text',
                },
                {
                  name: 'updated_by',
                  title: 'Updated By',
                  type: 'string',
                },
              ],
            },
          ],
        },
        {
          name: 'contract',
          title: 'Contract Information',
          type: 'object',
          fields: [
            {
              name: 'value',
              title: 'Contract Value',
              type: 'number',
              description: 'Total contract value',
            },
            {
              name: 'currency',
              title: 'Currency',
              type: 'string',
              initialValue: 'NOK',
            },
            {
              name: 'signed_date',
              title: 'Signed Date',
              type: 'date',
            },
            {
              name: 'start_date',
              title: 'Start Date',
              type: 'date',
            },
            {
              name: 'end_date',
              title: 'End Date',
              type: 'date',
            },
            {
              name: 'terms',
              title: 'Contract Terms',
              type: 'text',
            },
            {
              name: 'deliverables',
              title: 'Deliverables',
              type: 'array',
              of: [{ type: 'string' }],
            },
          ],
        },
        {
          name: 'communications',
          title: 'Communication History',
          type: 'array',
          of: [
            {
              type: 'object',
              fields: [
                {
                  name: 'date',
                  title: 'Date',
                  type: 'datetime',
                },
                {
                  name: 'type',
                  title: 'Communication Type',
                  type: 'string',
                  options: {
                    list: [
                      { title: 'Email', value: 'email' },
                      { title: 'Phone Call', value: 'phone' },
                      { title: 'Meeting', value: 'meeting' },
                      { title: 'Video Call', value: 'video_call' },
                      { title: 'LinkedIn Message', value: 'linkedin' },
                      { title: 'Other', value: 'other' },
                    ],
                  },
                },
                {
                  name: 'direction',
                  title: 'Direction',
                  type: 'string',
                  options: {
                    list: [
                      { title: 'Outbound', value: 'outbound' },
                      { title: 'Inbound', value: 'inbound' },
                    ],
                  },
                },
                {
                  name: 'summary',
                  title: 'Summary',
                  type: 'text',
                },
                {
                  name: 'outcome',
                  title: 'Outcome',
                  type: 'text',
                },
                {
                  name: 'next_action',
                  title: 'Next Action',
                  type: 'text',
                },
                {
                  name: 'logged_by',
                  title: 'Logged By',
                  type: 'string',
                },
              ],
            },
          ],
        },
        {
          name: 'assigned_to',
          title: 'Assigned To',
          type: 'string',
          description: 'Team member responsible for this sponsor relationship',
        },
        {
          name: 'priority',
          title: 'Priority',
          type: 'string',
          options: {
            list: [
              { title: 'Low', value: 'low' },
              { title: 'Medium', value: 'medium' },
              { title: 'High', value: 'high' },
              { title: 'Critical', value: 'critical' },
            ],
          },
        },
        {
          name: 'next_action_date',
          title: 'Next Action Date',
          type: 'date',
          description: 'When the next follow-up or action is due',
        },
        {
          name: 'notes',
          title: 'General Notes',
          type: 'text',
          description: 'Overall notes about the sponsor relationship',
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
  ],
})
