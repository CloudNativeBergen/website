import { formats } from '../../src/lib/proposal/types'
import { defineField, defineType, ValidationContext } from 'sanity'

export default defineType({
  name: 'conference',
  title: 'Conference',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'organizer',
      title: 'Organiser',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'city',
      title: 'City',
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
      name: 'venue_name',
      title: 'Venue Name',
      type: 'string',
    }),
    defineField({
      name: 'venue_address',
      title: 'Venue Address',
      type: 'string',
    }),
    defineField({
      name: 'tagline',
      title: 'Tagline',
      type: 'string',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
    }),
    defineField({
      name: 'announcement',
      title: 'Announcement',
      type: 'array',
      of: [{ type: 'block' }],
      description: 'Announcement to show on the conference landing page',
    }),
    defineField({
      name: 'vanity_metrics',
      title: 'Vanity Metrics',
      description: 'Metrics to show on the conference landing page',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'label', title: 'Label', type: 'string' },
            { name: 'value', title: 'Value', type: 'string' },
          ],
          options: {
            collapsible: true,
            collapsed: true,
          },
          preview: {
            select: {
              title: 'label',
              subtitle: 'value',
            },
          },
        },
      ],
    }),
    defineField({
      name: 'start_date',
      title: 'Start Date',
      type: 'date',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'end_date',
      title: 'End Date',
      type: 'date',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'cfp_start_date',
      title: 'CFP Start Date',
      type: 'date',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'cfp_end_date',
      title: 'CFP End Date',
      type: 'date',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'cfp_notify_date',
      title: 'CFP Notify Date',
      type: 'date',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'program_date',
      title: 'Program Date',
      type: 'date',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'coc_link',
      title: 'Code of Conduct Link',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'registration_link',
      title: 'Registration Link',
      type: 'string',
    }),
    defineField({
      name: 'registration_enabled',
      title: 'Registration Enabled',
      type: 'boolean',
      description: 'Whether the conference registration is enabled or not',
      initialValue: false,
      options: {
        layout: 'checkbox',
      },
    }),
    defineField({
      name: 'contact_email',
      title: 'Contact Email',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'checkin_customer_id',
      title: 'Checkin.no Customer ID',
      type: 'number',
      description: 'Customer ID for Checkin.no API integration',
    }),
    defineField({
      name: 'checkin_event_id',
      title: 'Checkin.no Event ID',
      type: 'number',
      description: 'Event ID for Checkin.no API integration',
    }),
    defineField({
      name: 'social_links',
      title: 'Socials Links',
      type: 'array',
      of: [{ type: 'string' }],
    }),
    defineField({
      name: 'organizers',
      title: 'Organizers',
      type: 'array',
      of: [{ type: 'reference', to: { type: 'speaker' } }],
      validation: (Rule) => Rule.required().min(1).unique(),
    }),
    defineField({
      name: 'domains',
      title: 'Domains',
      type: 'array',
      of: [{ type: 'string' }],
      validation: (Rule) => Rule.required().min(1).unique(),
    }),
    defineField({
      name: 'formats',
      title: 'Formats',
      description: 'Formats for CFP submissions and agenda categorization',
      type: 'array',
      of: [
        {
          type: 'string',
          options: {
            list: Array.from(formats).map(([value, title]) => ({ value, title })),
          }
        },
      ],
      validation: (Rule) => Rule.required().min(1).unique(),
    }),
    defineField({
      name: 'topics',
      title: 'Topics',
      description: 'Topics for CFP submissions and agenda categorization',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'topic' }],
        },
      ],
      validation: (Rule) => Rule.required().min(1).unique(),
    }),
    defineField({
      name: 'sponsors',
      title: 'Sponsors',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'sponsor',
              type: 'reference',
              to: { type: 'sponsor' },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'tier',
              type: 'reference',
              to: { type: 'sponsorTier' },
              //validation: (Rule) => Rule.required().custom((tier: any, context: ValidationContext) => {
              //  console.log('tier', tier)
              //  console.log('context', context)
              //  if (context.document && tier && 'conference' in tier && tier.conference &&
              //    tier.conference._ref !== context.document._id) {
              //    return 'Sponsor tier must belong to the same conference'
              //  }
              //  return true
              //})
            }),
          ],
          //validation: (Rule) => Rule.required().custom((sponsors: any[], context: ValidationContext) => {
          //  const uniqueSponsors = new Set()
          //  for (const sponsor of sponsors) {
          //    if (uniqueSponsors && Array.isArray(uniqueSponsors) && uniqueSponsors.has(sponsor.sponsor._ref)) {
          //      return 'Duplicate sponsors are not allowed'
          //    }
          //    uniqueSponsors.add(sponsor.sponsor._ref)
          //  }
          //  return true
          //}),
          preview: {
            select: {
              title: 'sponsor.name',
              subtitle: 'tier.title',
            },
          },
        },
      ],
      options: {
        layout: 'tags',
      },
    }),
    defineField({
      name: 'schedules',
      title: 'Schedules',
      type: 'array',
      of: [{ type: 'reference', to: { type: 'schedule' } }],
    }),
    defineField({
      name: 'features',
      title: 'Features',
      description: 'Experimental features for the conference site',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        list: [{ title: 'Test Feature', value: 'test_feature' }],
      },
    }),
  ],

  preview: {
    select: {
      title: 'title',
      city: 'city',
      country: 'country',
      start_date: 'start_date',
      end_date: 'end_date',
    },
    prepare(selection) {
      const { title, city, country, start_date, end_date } = selection
      return {
        ...selection,
        title: `${title} - ${city}, ${country} - ${start_date} - ${end_date}`,
      }
    },
  },
})
