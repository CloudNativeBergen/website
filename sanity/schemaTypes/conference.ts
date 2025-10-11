import { formats } from '@/lib/proposal/types'
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
      name: 'cfp_email',
      title: 'CFP Email',
      type: 'string',
      description: 'Email address used for CFP communications with speakers',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'program_date',
      title: 'Program Date',
      type: 'date',
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
      name: 'workshop_registration_start',
      title: 'Workshop Registration Start',
      type: 'datetime',
      description: 'When workshop registration opens',
    }),
    defineField({
      name: 'workshop_registration_end',
      title: 'Workshop Registration End',
      type: 'datetime',
      description: 'When workshop registration closes',
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
      name: 'ticket_capacity',
      title: 'Maximum Ticket Capacity',
      type: 'number',
      description:
        'Total maximum number of tickets available for sale (excluding sponsor/speaker tickets)',
      validation: (Rule) => Rule.min(1),
    }),
    defineField({
      name: 'ticket_targets',
      title: 'Ticket Sales Targets',
      type: 'object',
      description:
        'Configuration for ticket sales target tracking and milestones',
      fields: [
        defineField({
          name: 'enabled',
          title: 'Enable Target Tracking',
          type: 'boolean',
          description:
            'Whether to enable ticket sales target tracking for this conference',
          initialValue: false,
        }),
        defineField({
          name: 'sales_start_date',
          title: 'Sales Start Date',
          type: 'date',
          description: 'When ticket sales officially began',
          hidden: ({ parent }) => !parent?.enabled,
        }),
        defineField({
          name: 'target_curve',
          title: 'Target Progression Curve',
          type: 'string',
          description: 'How targets should progress over time',
          options: {
            list: [
              { title: 'Linear - Steady progression', value: 'linear' },
              {
                title: 'Early Push - Higher targets early on',
                value: 'early_push',
              },
              {
                title: 'Late Push - Higher targets near the end',
                value: 'late_push',
              },
              {
                title: 'S-Curve - Slow start, rapid middle, slow end',
                value: 's_curve',
              },
            ],
          },
          initialValue: 'linear',
          hidden: ({ parent }) => !parent?.enabled,
        }),
        defineField({
          name: 'milestones',
          title: 'Sales Milestones',
          type: 'array',
          description: 'Key dates and target percentages for ticket sales',
          of: [
            {
              type: 'object',
              fields: [
                defineField({
                  name: 'date',
                  title: 'Milestone Date',
                  type: 'date',
                  validation: (Rule) => Rule.required(),
                }),
                defineField({
                  name: 'target_percentage',
                  title: 'Target Percentage',
                  type: 'number',
                  description:
                    'Target percentage of total capacity to be sold by this date',
                  validation: (Rule) => Rule.min(0).max(100),
                }),
                defineField({
                  name: 'label',
                  title: 'Milestone Label',
                  type: 'string',
                  description:
                    'Optional label for this milestone (e.g., "Early Bird End", "CFP Close")',
                }),
              ],
              preview: {
                select: {
                  title: 'label',
                  subtitle: 'date',
                  description: 'target_percentage',
                },
                prepare(selection) {
                  const { title, subtitle, description } = selection
                  return {
                    title: title || subtitle,
                    subtitle: `${description}% target by ${subtitle}`,
                  }
                },
              },
            },
          ],
          hidden: ({ parent }) => !parent?.enabled,
        }),
      ],
      hidden: ({ document }) => !document?.ticket_capacity,
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
      name: 'featured_speakers',
      title: 'Featured Speakers',
      type: 'array',
      of: [{ type: 'reference', to: { type: 'speaker' } }],
      validation: (Rule) => Rule.unique(),
      initialValue: [],
    }),
    defineField({
      name: 'featured_talks',
      title: 'Featured Talks',
      type: 'array',
      of: [{ type: 'reference', to: { type: 'talk' } }],
      validation: (Rule) => Rule.unique(),
      initialValue: [],
      description: 'Talks to highlight in the Program Highlights section',
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
            list: Array.from(formats).map(([value, title]) => ({
              value,
              title,
            })),
          },
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
              options: {
                filter: ({ document }) => {
                  if (!document?._id) return {}

                  const conferenceId = document._id.replace(/^drafts\./, '')

                  return {
                    filter: 'conference._ref == $conferenceId',
                    params: { conferenceId },
                  }
                },
              },
            }),
          ],
          preview: {
            select: {
              title: 'sponsor.name',
              subtitle: 'tier.title',
            },
          },
        },
      ],
      validation: (Rule) =>
        Rule.custom((sponsors: any[] | undefined) => {
          if (!sponsors || !Array.isArray(sponsors)) {
            return true
          }

          const sponsorRefs = sponsors
            .filter((item) => item.sponsor?._ref)
            .map((item) => item.sponsor._ref)

          const uniqueSponsors = new Set(sponsorRefs)

          if (uniqueSponsors.size !== sponsorRefs.length) {
            return 'Duplicate sponsors are not allowed in the same conference'
          }

          return true
        }),
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
