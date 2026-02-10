import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'travelSupport',
  title: 'Travel Support',
  type: 'document',
  fields: [
    defineField({
      name: 'speaker',
      title: 'Speaker',
      type: 'reference',
      to: [{ type: 'speaker' }],
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
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Draft', value: 'draft' },
          { title: 'Submitted', value: 'submitted' },
          { title: 'Approved', value: 'approved' },
          { title: 'Paid', value: 'paid' },
          { title: 'Rejected', value: 'rejected' },
        ],
      },
      initialValue: 'draft',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'bankingDetails',
      title: 'Banking Details',
      type: 'object',
      fields: [
        defineField({
          name: 'beneficiaryName',
          title: 'Beneficiary Name',
          type: 'string',
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'bankName',
          title: 'Bank Name',
          type: 'string',
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'iban',
          title: 'IBAN',
          type: 'string',
          description:
            'International Bank Account Number (for EU/EEA countries)',
        }),
        defineField({
          name: 'accountNumber',
          title: 'Account Number',
          type: 'string',
          description: 'For non-IBAN countries',
        }),
        defineField({
          name: 'swiftCode',
          title: 'SWIFT/BIC Code',
          type: 'string',
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'country',
          title: 'Country',
          type: 'string',
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'preferredCurrency',
          title: 'Preferred Currency',
          type: 'string',
          options: {
            list: [
              { title: 'NOK - Norwegian Krone', value: 'NOK' },
              { title: 'USD - US Dollar', value: 'USD' },
              { title: 'EUR - Euro', value: 'EUR' },
              { title: 'GBP - British Pound', value: 'GBP' },
              { title: 'SEK - Swedish Krona', value: 'SEK' },
              { title: 'DKK - Danish Krone', value: 'DKK' },
              { title: 'Other', value: 'OTHER' },
            ],
          },
          initialValue: 'NOK',
          validation: (Rule) => Rule.required(),
          description: 'Currency for expense summaries and reimbursements',
        }),
      ],
      validation: (Rule) =>
        Rule.custom((bankingDetails) => {
          if (!bankingDetails) return true

          const { iban, accountNumber } = bankingDetails as any
          if (!iban && !accountNumber) {
            return 'Either IBAN or Account Number is required'
          }
          return true
        }),
    }),
    defineField({
      name: 'totalAmount',
      title: 'Total Amount',
      type: 'number',
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: 'approvedAmount',
      title: 'Approved Amount',
      type: 'number',
      validation: (Rule) => Rule.min(0),
      hidden: ({ document }) => document?.status === 'draft',
    }),
    defineField({
      name: 'submittedAt',
      title: 'Submitted At',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'reviewedAt',
      title: 'Reviewed At',
      type: 'datetime',
      readOnly: true,
      hidden: ({ document }) =>
        ['draft', 'submitted'].includes(document?.status as string),
    }),
    defineField({
      name: 'reviewedBy',
      title: 'Reviewed By',
      type: 'reference',
      to: [{ type: 'speaker' }],
      hidden: ({ document }) =>
        ['draft', 'submitted'].includes(document?.status as string),
    }),
    defineField({
      name: 'reviewNotes',
      title: 'Review Notes',
      type: 'text',
      hidden: ({ document }) =>
        ['draft', 'submitted'].includes(document?.status as string),
    }),
    defineField({
      name: 'expectedPaymentDate',
      title: 'Expected Payment Date',
      type: 'date',
      description:
        'Expected date when the payment will be made (set when approving)',
      hidden: ({ document }) =>
        !['approved', 'paid'].includes(document?.status as string),
    }),
    defineField({
      name: 'paidAt',
      title: 'Paid At',
      type: 'datetime',
      description: 'When the payment was actually made',
      readOnly: true,
      hidden: ({ document }) => document?.status !== 'paid',
    }),
  ],
  preview: {
    select: {
      speakerName: 'speaker.name',
      conferenceName: 'conference.title',
      status: 'status',
      totalAmount: 'totalAmount',
    },
    prepare({ speakerName, conferenceName, status, totalAmount }) {
      return {
        title: `${speakerName || 'Unknown Speaker'} - ${conferenceName || 'Unknown Conference'}`,
        subtitle: `Status: ${status || 'draft'} | Total: ${totalAmount ?? 'No amount'}`,
      }
    },
  },
})
