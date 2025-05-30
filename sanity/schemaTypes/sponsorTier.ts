import { define } from 'nock'
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
      name: 'price',
      title: 'Price',
      description: 'Sponsor tier price without vat',
      type: 'array',
      of: [
        {
          type: 'object',
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
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'perks',
      title: 'Perks',
      type: 'array',
      of: [
        {
          type: 'object',
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
      price: 'price.0.amount',
      currency: 'price.0.currency',
      subtitle: 'conference.title',
    },
    prepare({ title, price, currency, subtitle }) {
      return {
        title: `${title} (${price} ${currency})`,
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
        { field: 'title', direction: 'asc' },
      ],
    },
  ],
})
