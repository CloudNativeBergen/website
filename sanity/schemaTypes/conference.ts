import { formats } from '../../src/lib/proposal/types'
import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'conference',
  title: 'Conference',
  type: 'document',
  fieldsets: [
    {
      name: 'basicInfo',
      title: 'Basic Information',
      options: { collapsible: true, collapsed: false },
    },
    {
      name: 'branding',
      title: 'Branding',
      description:
        'Custom logos for this conference. Leave empty to use defaults.',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'dates',
      title: 'Important Dates',
      options: { collapsible: true, collapsed: false },
    },
    {
      name: 'registration',
      title: 'Registration & Workshops',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'ticketing',
      title: 'Ticketing & Integrations',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'communication',
      title: 'Communication',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'content',
      title: 'Content & Announcements',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'cfpConfig',
      title: 'CFP Configuration',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'sponsorship',
      title: 'Sponsorship Prospectus',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'relations',
      title: 'People & Sponsors',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'technical',
      title: 'Technical Configuration',
      options: { collapsible: true, collapsed: true },
    },
  ],
  fields: [
    // === Basic Information ===
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      fieldset: 'basicInfo',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'organizer',
      title: 'Organiser',
      type: 'string',
      fieldset: 'basicInfo',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'city',
      title: 'City',
      type: 'string',
      fieldset: 'basicInfo',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'country',
      title: 'Country',
      type: 'string',
      fieldset: 'basicInfo',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'venue_name',
      title: 'Venue Name',
      type: 'string',
      fieldset: 'basicInfo',
    }),
    defineField({
      name: 'venue_address',
      title: 'Venue Address',
      type: 'string',
      fieldset: 'basicInfo',
    }),
    defineField({
      name: 'tagline',
      title: 'Tagline',
      type: 'string',
      fieldset: 'basicInfo',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      fieldset: 'basicInfo',
    }),

    // === Branding ===
    defineField({
      name: 'logo_bright',
      title: 'Logo (Light Mode)',
      type: 'inlineSvg',
      description:
        'Horizontal logo with text for light backgrounds. If not set, the default logo will be used.',
      fieldset: 'branding',
    }),
    defineField({
      name: 'logo_dark',
      title: 'Logo (Dark Mode)',
      type: 'inlineSvg',
      description:
        'Horizontal logo with text for dark backgrounds. Falls back to Logo (Light Mode) if not set.',
      fieldset: 'branding',
    }),
    defineField({
      name: 'logomark_bright',
      title: 'Logo Mark (Light Mode)',
      type: 'inlineSvg',
      description:
        'Icon-only logo mark for light backgrounds (used in compact layouts). Falls back to default if not set.',
      fieldset: 'branding',
    }),
    defineField({
      name: 'logomark_dark',
      title: 'Logo Mark (Dark Mode)',
      type: 'inlineSvg',
      description:
        'Icon-only logo mark for dark backgrounds. Falls back to Logo Mark (Light Mode) if not set.',
      fieldset: 'branding',
    }),

    // === Important Dates ===
    defineField({
      name: 'start_date',
      title: 'Start Date',
      type: 'date',
      fieldset: 'dates',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'end_date',
      title: 'End Date',
      type: 'date',
      fieldset: 'dates',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'cfp_start_date',
      title: 'CFP Start Date',
      type: 'date',
      fieldset: 'dates',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'cfp_end_date',
      title: 'CFP End Date',
      type: 'date',
      fieldset: 'dates',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'cfp_notify_date',
      title: 'CFP Notify Date',
      type: 'date',
      fieldset: 'dates',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'program_date',
      title: 'Program Date',
      type: 'date',
      fieldset: 'dates',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'travel_support_payment_date',
      title: 'Travel Support Payment Date',
      type: 'date',
      fieldset: 'dates',
      description:
        'Default expected payment date for travel support requests. This can be overridden per request.',
    }),

    // === Registration & Workshops ===
    defineField({
      name: 'registration_link',
      title: 'Registration Link',
      type: 'string',
      fieldset: 'registration',
    }),
    defineField({
      name: 'registration_enabled',
      title: 'Registration Enabled',
      type: 'boolean',
      fieldset: 'registration',
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
      fieldset: 'registration',
      description: 'When workshop registration opens',
    }),
    defineField({
      name: 'workshop_registration_end',
      title: 'Workshop Registration End',
      type: 'datetime',
      fieldset: 'registration',
      description: 'When workshop registration closes',
    }),

    // === Ticketing & Integrations ===
    defineField({
      name: 'checkin_customer_id',
      title: 'Checkin.no Customer ID',
      type: 'number',
      fieldset: 'ticketing',
      description: 'Customer ID for Checkin.no API integration',
    }),
    defineField({
      name: 'checkin_event_id',
      title: 'Checkin.no Event ID',
      type: 'number',
      fieldset: 'ticketing',
      description: 'Event ID for Checkin.no API integration',
    }),
    defineField({
      name: 'ticket_capacity',
      title: 'Maximum Ticket Capacity',
      type: 'number',
      fieldset: 'ticketing',
      description:
        'Total maximum number of tickets available for sale (excluding sponsor/speaker tickets)',
      validation: (Rule) => Rule.min(1),
    }),
    defineField({
      name: 'ticket_targets',
      title: 'Ticket Sales Targets',
      type: 'object',
      fieldset: 'ticketing',
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

    // === Communication ===
    defineField({
      name: 'contact_email',
      title: 'Contact Email',
      type: 'string',
      fieldset: 'communication',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'cfp_email',
      title: 'CFP Email',
      type: 'string',
      fieldset: 'communication',
      description: 'Email address used for CFP communications with speakers',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'sponsor_email',
      title: 'Sponsor Email',
      type: 'string',
      fieldset: 'communication',
      description: 'Email address used for sponsor communications',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'social_links',
      title: 'Social Links',
      type: 'array',
      fieldset: 'communication',
      of: [{ type: 'string' }],
    }),

    // === Content & Announcements ===
    defineField({
      name: 'announcement',
      title: 'Announcement',
      type: 'array',
      fieldset: 'content',
      of: [{ type: 'block' }],
      description: 'Announcement to show on the conference landing page',
    }),
    defineField({
      name: 'vanity_metrics',
      title: 'Vanity Metrics',
      type: 'array',
      fieldset: 'content',
      description: 'Metrics to show on the conference landing page',
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

    // === CFP Configuration ===
    defineField({
      name: 'formats',
      title: 'Formats',
      type: 'array',
      fieldset: 'cfpConfig',
      description: 'Formats for CFP submissions and agenda categorization',
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
      type: 'array',
      fieldset: 'cfpConfig',
      description: 'Topics for CFP submissions and agenda categorization',
      of: [
        {
          type: 'reference',
          to: [{ type: 'topic' }],
        },
      ],
      validation: (Rule) => Rule.required().min(1).unique(),
    }),

    // === Sponsorship Prospectus ===
    defineField({
      name: 'sponsor_benefits',
      title: 'Sponsor Benefits',
      type: 'array',
      fieldset: 'sponsorship',
      description:
        'Key benefits displayed in the "Why Sponsor" section on the website.',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'title',
              title: 'Title',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'description',
              title: 'Description',
              type: 'text',
              rows: 3,
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'icon',
              title: 'Icon Name',
              type: 'string',
              description: 'Heroicon name (e.g. "UserGroupIcon")',
            }),
          ],
        },
      ],
    }),
    defineField({
      name: 'sponsorship_customization',
      title: 'Sponsorship Page Customization',
      type: 'object',
      fieldset: 'sponsorship',
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({
          name: 'hero_headline',
          type: 'string',
          title: 'Hero Headline',
          initialValue: 'No Sales Pitches. Just Code & Culture.',
        }),
        defineField({
          name: 'hero_subheadline',
          type: 'text',
          title: 'Hero Subheadline',
          initialValue:
            'We prioritize engineering value over marketing fluff. Our audience builds the platforms Norway runs on. Join us in powering the voyage.',
        }),
        defineField({
          name: 'package_section_title',
          type: 'string',
          title: 'Package Section Title',
          initialValue: 'The Base Image',
        }),
        defineField({
          name: 'addon_section_title',
          type: 'string',
          title: 'Addon Section Title',
          initialValue: 'Custom Resource Definitions (CRDs)',
        }),
        defineField({
          name: 'philosophy_title',
          type: 'string',
          title: 'Philosophy Title',
          initialValue: "We Don't Sell Booths. We Build Credibility.",
        }),
        defineField({
          name: 'philosophy_description',
          type: 'text',
          title: 'Philosophy Description',
          initialValue:
            "We intentionally do not have a traditional Expo Hall. Why? Because the best engineers don't like being sold to in a booth. Instead, we integrate your brand into the fabric of the event through digital hype, on-site signage, and our curated 'Wall of Opportunities'.",
        }),
        defineField({
          name: 'closing_quote',
          type: 'string',
          title: 'Closing Quote',
          initialValue:
            "The best engineers don't apply to job ads; they work for companies they respect.",
        }),
        defineField({
          name: 'closing_cta_text',
          type: 'string',
          title: 'Closing CTA Text',
          initialValue: 'git commit -m "Support the Community"',
        }),
        defineField({
          name: 'prospectus_url',
          type: 'url',
          title: 'Prospectus PDF/Link',
          description:
            'Optional link to a PDF or external page with the full sponsorship prospectus',
        }),
      ],
    }),

    // === People & Sponsors ===
    defineField({
      name: 'organizers',
      title: 'Organizers',
      type: 'array',
      fieldset: 'relations',
      of: [{ type: 'reference', to: { type: 'speaker' } }],
      validation: (Rule) => Rule.required().min(1).unique(),
    }),
    defineField({
      name: 'featured_speakers',
      title: 'Featured Speakers',
      type: 'array',
      fieldset: 'relations',
      of: [{ type: 'reference', to: { type: 'speaker' } }],
      validation: (Rule) => Rule.unique(),
      initialValue: [],
    }),
    defineField({
      name: 'featured_talks',
      title: 'Featured Talks',
      type: 'array',
      fieldset: 'relations',
      of: [{ type: 'reference', to: { type: 'talk' } }],
      validation: (Rule) => Rule.unique(),
      initialValue: [],
      description: 'Talks to highlight in the Program Highlights section',
    }),
    defineField({
      name: 'sponsors',
      title: 'Sponsors',
      type: 'array',
      fieldset: 'relations',
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
      fieldset: 'relations',
      of: [{ type: 'reference', to: { type: 'schedule' } }],
    }),

    // === Technical Configuration ===
    defineField({
      name: 'domains',
      title: 'Domains',
      type: 'array',
      fieldset: 'technical',
      of: [{ type: 'string' }],
      validation: (Rule) => Rule.required().min(1).unique(),
    }),
    defineField({
      name: 'features',
      title: 'Features',
      type: 'array',
      fieldset: 'technical',
      description: 'Experimental features for the conference site',
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
