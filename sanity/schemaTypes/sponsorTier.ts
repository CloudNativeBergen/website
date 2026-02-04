import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'sponsorTier',
  title: 'Sponsor Tier',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'tagline',
      title: 'Tagline',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'tier_type',
      title: 'Tier Type',
      type: 'string',
      options: {
        list: [
          { title: 'Standard Sponsor', value: 'standard' },
          {
            title: 'Special Sponsor (Media, Community, etc.)',
            value: 'special',
          },
          { title: 'Add-on (Booth, Dinner, etc.)', value: 'addon' },
        ],
        layout: 'radio',
      },
      initialValue: 'standard',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'price',
      title: 'Price',
      description:
        'Sponsor tier price without vat (not required for special sponsors)',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'priceItem',
          fields: [
            { name: 'amount', title: 'Amount', type: 'number' },
            {
              name: 'currency',
              title: 'Currency',
              type: 'string',
              options: { list: ['NOK', 'USD', 'EUR'] },
            },
          ],
          preview: {
            select: {
              title: 'amount',
              subtitle: 'currency',
            },
          },
        },
      ],
      options: {
        layout: 'tags',
      },
      validation: (Rule) =>
        Rule.custom((price, context) => {
          const tierType = context.document?.tier_type
          if (tierType === 'standard' && (!price || price.length === 0)) {
            return 'Price is required for standard sponsor tiers'
          }
          return true
        }),
      hidden: ({ document }) => document?.tier_type === 'special',
    }),
    defineField({
      name: 'perks',
      title: 'Perks',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'perkItem',
          fields: [
            { name: 'label', title: 'Label', type: 'string' },
            { name: 'description', title: 'Description', type: 'string' },
          ],
          preview: {
            select: {
              title: 'label',
              subtitle: 'description',
            },
          },
        },
      ],
      options: {
        layout: 'tags',
      },
      validation: (Rule) =>
        Rule.custom((perks, context) => {
          const tierType = context.document?.tier_type
          if (tierType === 'standard' && (!perks || perks.length === 0)) {
            return 'Perks are required for standard sponsor tiers'
          }
          return true
        }),
    }),
    defineField({
      name: 'max_quantity',
      title: 'Max Quantity',
      type: 'number',
      description: 'Maximum number of available spots (leave empty for unlimited). 1 = Exclusive.',
      validation: (Rule) => Rule.min(1),
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'sold_out',
      title: 'Sold Out',
      type: 'boolean',
      initialValue: false,
      description: 'Mark this tier as sold out',
      options: {
        layout: 'checkbox',
      },
    }),
    defineField({
      name: 'most_popular',
      title: 'Most Popular',
      type: 'boolean',
      initialValue: false,
      description: 'Mark this tier as most popular',
      options: {
        layout: 'checkbox',
      },
    }),
  ],
  preview: {
    select: {
      title: 'title',
      tierType: 'tier_type',
      price: 'price.0.amount',
      currency: 'price.0.currency',
      subtitle: 'conference.title',
    },
    prepare({ title, tierType, price, currency, subtitle }) {
      const priceDisplay =
        tierType === 'special' ? 'Special' : `${price} ${currency}`
      return {
        title: `${title} (${priceDisplay})`,
        subtitle: `${subtitle}`,
      }
    },
  },
  orderings: [
    {
      title: 'Conference',
      name: 'conference',
      by: [
        { field: 'conference.title', direction: 'desc' },
        { field: 'tier_type', direction: 'asc' },
        { field: 'title', direction: 'asc' },
      ],
    },
    {
      title: 'Type and Order',
      name: 'typeAndOrder',
      by: [
        { field: 'tier_type', direction: 'asc' },
        { field: 'price.0.amount', direction: 'desc' },
        { field: 'title', direction: 'asc' },
      ],
    },
  ],
})
