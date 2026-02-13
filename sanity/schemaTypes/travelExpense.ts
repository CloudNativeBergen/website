import { defineField, defineType } from 'sanity'
import { CURRENCY_OPTIONS } from './constants'

export default defineType({
  name: 'travelExpense',
  title: 'Travel Expense',
  type: 'document',
  fields: [
    defineField({
      name: 'travelSupport',
      title: 'Travel Support',
      type: 'reference',
      to: [{ type: 'travelSupport' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          { title: 'Accommodation', value: 'accommodation' },
          { title: 'Transportation', value: 'transportation' },
          { title: 'Meals', value: 'meals' },
          { title: 'Visa/Immigration', value: 'visa' },
          { title: 'Other', value: 'other' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'string',
      validation: (Rule) => Rule.required().max(500),
    }),
    defineField({
      name: 'amount',
      title: 'Amount',
      type: 'number',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'currency',
      title: 'Currency',
      type: 'string',
      options: {
        list: [...CURRENCY_OPTIONS],
      },
      initialValue: 'NOK',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'customCurrency',
      title: 'Custom Currency Code',
      type: 'string',
      description: 'Enter 3-letter currency code (e.g., CAD, AUD, JPY)',
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const currency = (context.document as any)?.currency
          if (currency === 'OTHER' && !value) {
            return 'Currency code is required when "Other" is selected'
          }
          if (value && !/^[A-Z]{3}$/.test(value)) {
            return 'Currency code must be 3 uppercase letters'
          }
          return true
        }),
      hidden: ({ document }) => document?.currency !== 'OTHER',
    }),
    defineField({
      name: 'expenseDate',
      title: 'Expense Date',
      type: 'date',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'location',
      title: 'Location',
      type: 'string',
      description:
        'City/Country (e.g., "Copenhagen, Denmark" or "Copenhagen → Bergen")',
    }),
    defineField({
      name: 'receipts',
      title: 'Receipts',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'file',
              title: 'Receipt File',
              type: 'file',
              options: {
                accept: '.pdf,.jpg,.jpeg,.png',
              },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'filename',
              title: 'File Name',
              type: 'string',
              readOnly: true,
            }),
            defineField({
              name: 'uploadedAt',
              title: 'Uploaded At',
              type: 'datetime',
              readOnly: true,
            }),
          ],
          preview: {
            select: {
              filename: 'filename',
              uploadedAt: 'uploadedAt',
            },
            prepare({ filename, uploadedAt }) {
              return {
                title: filename || 'Receipt',
                subtitle: uploadedAt
                  ? new Date(uploadedAt).toLocaleDateString()
                  : '',
              }
            },
          },
        },
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Pending Review', value: 'pending' },
          { title: 'Approved', value: 'approved' },
          { title: 'Rejected', value: 'rejected' },
        ],
      },
      initialValue: 'pending',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'reviewNotes',
      title: 'Review Notes',
      type: 'text',
      description: 'Admin notes on approval/rejection',
      hidden: ({ document }) => document?.status === 'pending',
    }),
  ],
  preview: {
    select: {
      description: 'description',
      amount: 'amount',
      currency: 'currency',
      customCurrency: 'customCurrency',
      category: 'category',
      status: 'status',
    },
    prepare({
      description,
      amount,
      currency,
      customCurrency,
      category,
      status,
    }) {
      const displayCurrency = currency === 'OTHER' ? customCurrency : currency
      return {
        title: description || `${category} expense`,
        subtitle: `${amount} ${displayCurrency || ''} - ${status}`,
      }
    },
  },
})
