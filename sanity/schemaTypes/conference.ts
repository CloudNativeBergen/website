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
      name: 'venueName',
      title: 'Venue Name',
      type: 'string',
      fieldset: 'basicInfo',
    }),
    defineField({
      name: 'venueAddress',
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
      name: 'logoBright',
      title: 'Logo (Light Mode)',
      type: 'inlineSvg',
      description:
        'Horizontal logo with text for light backgrounds. If not set, the default logo will be used.',
      fieldset: 'branding',
    }),
    defineField({
      name: 'logoDark',
      title: 'Logo (Dark Mode)',
      type: 'inlineSvg',
      description:
        'Horizontal logo with text for dark backgrounds. Falls back to Logo (Light Mode) if not set.',
      fieldset: 'branding',
    }),
    defineField({
      name: 'logomarkBright',
      title: 'Logo Mark (Light Mode)',
      type: 'inlineSvg',
      description:
        'Icon-only logo mark for light backgrounds (used in compact layouts). Falls back to default if not set.',
      fieldset: 'branding',
    }),
    defineField({
      name: 'logomarkDark',
      title: 'Logo Mark (Dark Mode)',
      type: 'inlineSvg',
      description:
        'Icon-only logo mark for dark backgrounds. Falls back to Logo Mark (Light Mode) if not set.',
      fieldset: 'branding',
    }),

    // === Important Dates ===
    defineField({
      name: 'startDate',
      title: 'Start Date',
      type: 'date',
      fieldset: 'dates',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'endDate',
      title: 'End Date',
      type: 'date',
      fieldset: 'dates',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'cfpStartDate',
      title: 'CFP Start Date',
      type: 'date',
      fieldset: 'dates',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'cfpEndDate',
      title: 'CFP End Date',
      type: 'date',
      fieldset: 'dates',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'cfpNotifyDate',
      title: 'CFP Notify Date',
      type: 'date',
      fieldset: 'dates',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'programDate',
      title: 'Program Date',
      type: 'date',
      fieldset: 'dates',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'travelSupportPaymentDate',
      title: 'Travel Support Payment Date',
      type: 'date',
      fieldset: 'dates',
      description:
        'Default expected payment date for travel support requests. This can be overridden per request.',
    }),
    defineField({
      name: 'travelSupportBudget',
      title: 'Travel Support Budget',
      type: 'number',
      fieldset: 'dates',
      description:
        'Total budget allocated for travel support (in conference currency)',
      validation: (Rule) => Rule.min(0),
    }),

    // === Registration & Workshops ===
    defineField({
      name: 'registrationLink',
      title: 'Registration Link',
      type: 'string',
      fieldset: 'registration',
    }),
    defineField({
      name: 'registrationEnabled',
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
      name: 'workshopRegistrationStart',
      title: 'Workshop Registration Start',
      type: 'datetime',
      fieldset: 'registration',
      description: 'When workshop registration opens',
    }),
    defineField({
      name: 'workshopRegistrationEnd',
      title: 'Workshop Registration End',
      type: 'datetime',
      fieldset: 'registration',
      description: 'When workshop registration closes',
    }),

    // === Ticketing & Integrations ===
    defineField({
      name: 'checkinCustomerId',
      title: 'Checkin.no Customer ID',
      type: 'number',
      fieldset: 'ticketing',
      description: 'Customer ID for Checkin.no API integration',
    }),
    defineField({
      name: 'checkinEventId',
      title: 'Checkin.no Event ID',
      type: 'number',
      fieldset: 'ticketing',
      description: 'Event ID for Checkin.no API integration',
    }),
    defineField({
      name: 'ticketCapacity',
      title: 'Maximum Ticket Capacity',
      type: 'number',
      fieldset: 'ticketing',
      description:
        'Total maximum number of tickets available for sale (excluding sponsor/speaker tickets)',
      validation: (Rule) => Rule.min(1),
    }),
    defineField({
      name: 'ticketTargets',
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
          name: 'salesStartDate',
          title: 'Sales Start Date',
          type: 'date',
          description: 'When ticket sales officially began',
          hidden: ({ parent }) => !parent?.enabled,
        }),
        defineField({
          name: 'targetCurve',
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
                  name: 'targetPercentage',
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
                  description: 'targetPercentage',
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
      hidden: ({ document }) => !document?.ticketCapacity,
    }),
    defineField({
      name: 'ticketCustomization',
      title: 'Ticket Page Customization',
      type: 'object',
      fieldset: 'ticketing',
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({
          name: 'heroHeadline',
          type: 'string',
          title: 'Hero Headline',
          description: 'Main headline on the tickets page',
        }),
        defineField({
          name: 'heroSubheadline',
          type: 'text',
          title: 'Hero Subheadline',
          rows: 3,
          description:
            'Subheadline text below the main headline. Leave blank to auto-generate from conference name and dates.',
        }),
        defineField({
          name: 'showVanityMetrics',
          title: 'Show Vanity Metrics',
          type: 'boolean',
          description:
            'Show the vanity metrics bar (attendees, speakers, etc.) on the tickets page. Uses the same metrics configured under Content & Announcements.',
          initialValue: false,
        }),
        defineField({
          name: 'groupDiscountInfo',
          type: 'text',
          title: 'Group Discount Information',
          rows: 3,
          description:
            'Information about group discounts or special offers. Leave blank to hide this section.',
        }),
        defineField({
          name: 'ctaButtonText',
          type: 'string',
          title: 'CTA Button Text',
          description:
            'Text for the main registration button. Defaults to "Register Now".',
        }),
      ],
    }),
    defineField({
      name: 'ticketInclusions',
      title: 'Ticket Inclusions',
      type: 'array',
      fieldset: 'ticketing',
      description:
        'What attendees get with their ticket. Displayed as "What\'s Included" on the tickets page.',
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
              rows: 2,
            }),
            defineField({
              name: 'icon',
              title: 'Icon',
              type: 'string',
              options: {
                list: [
                  { title: 'Microphone', value: 'MicrophoneIcon' },
                  { title: 'User Group', value: 'UserGroupIcon' },
                  {
                    title: 'Presentation Chart',
                    value: 'PresentationChartBarIcon',
                  },
                  { title: 'Academic Cap', value: 'AcademicCapIcon' },
                  { title: 'Sparkles', value: 'SparklesIcon' },
                  { title: 'Light Bulb', value: 'LightBulbIcon' },
                  { title: 'Cup Soda', value: 'BeakerIcon' },
                  { title: 'Gift', value: 'GiftIcon' },
                  { title: 'Film', value: 'FilmIcon' },
                  { title: 'Camera', value: 'CameraIcon' },
                  { title: 'Code Bracket', value: 'CodeBracketIcon' },
                  { title: 'Command Line', value: 'CommandLineIcon' },
                  { title: 'CPU Chip', value: 'CpuChipIcon' },
                  { title: 'Chat Bubble', value: 'ChatBubbleLeftRightIcon' },
                  { title: 'Trophy', value: 'TrophyIcon' },
                  { title: 'Heart', value: 'HeartIcon' },
                  { title: 'Star', value: 'StarIcon' },
                  { title: 'Globe', value: 'GlobeAltIcon' },
                  { title: 'Musical Note', value: 'MusicalNoteIcon' },
                  { title: 'Check Badge', value: 'CheckBadgeIcon' },
                ],
              },
            }),
          ],
          preview: {
            select: {
              title: 'title',
              subtitle: 'description',
            },
          },
        },
      ],
    }),
    defineField({
      name: 'ticketFaqs',
      title: 'Ticket FAQs',
      type: 'array',
      fieldset: 'ticketing',
      description:
        'Frequently asked questions about tickets and registration. Displayed on the tickets page.',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'question',
              title: 'Question',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'answer',
              title: 'Answer',
              type: 'text',
              rows: 4,
              validation: (Rule) => Rule.required(),
            }),
          ],
          preview: {
            select: {
              title: 'question',
              subtitle: 'answer',
            },
          },
        },
      ],
    }),

    // === Communication ===
    defineField({
      name: 'contactEmail',
      title: 'Contact Email',
      type: 'string',
      fieldset: 'communication',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'cfpEmail',
      title: 'CFP Email',
      type: 'string',
      fieldset: 'communication',
      description: 'Email address used for CFP communications with speakers',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'sponsorEmail',
      title: 'Sponsor Email',
      type: 'string',
      fieldset: 'communication',
      description: 'Email address used for sponsor communications',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'salesNotificationChannel',
      title: 'Weekly Update Slack Channel',
      type: 'string',
      fieldset: 'communication',
      description:
        'Slack channel name where weekly updates are posted (e.g. #conference-updates)',
    }),
    defineField({
      name: 'cfpNotificationChannel',
      title: 'CFP Notification Slack Channel',
      type: 'string',
      fieldset: 'communication',
      description:
        'Slack channel name where CFP notifications are posted (e.g. #conference-cfp)',
    }),
    defineField({
      name: 'socialLinks',
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
      name: 'vanityMetrics',
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
    defineField({
      name: 'cfpSubmissionGoal',
      title: 'CFP Submission Goal',
      type: 'number',
      fieldset: 'cfpConfig',
      description: 'Target number of CFP submissions for dashboard tracking',
      validation: (Rule) => Rule.min(1),
    }),
    defineField({
      name: 'cfpLightningGoal',
      title: 'Lightning Talk Goal',
      type: 'number',
      fieldset: 'cfpConfig',
      description: 'Target number of lightning talk submissions',
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: 'cfpPresentationGoal',
      title: 'Presentation Goal',
      type: 'number',
      fieldset: 'cfpConfig',
      description: 'Target number of presentation submissions',
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: 'cfpWorkshopGoal',
      title: 'Workshop Goal',
      type: 'number',
      fieldset: 'cfpConfig',
      description: 'Target number of workshop submissions',
      validation: (Rule) => Rule.min(0),
    }),

    // === Sponsorship Prospectus ===
    defineField({
      name: 'sponsorRevenueGoal',
      title: 'Sponsor Revenue Goal',
      type: 'number',
      fieldset: 'sponsorship',
      description:
        'Target sponsor revenue for dashboard tracking (in conference currency)',
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: 'sponsorBenefits',
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
              title: 'Icon',
              type: 'string',
              options: {
                list: [
                  { title: 'User Group', value: 'UserGroupIcon' },
                  { title: 'Megaphone', value: 'MegaphoneIcon' },
                  { title: 'Sparkles', value: 'SparklesIcon' },
                  { title: 'Rocket Launch', value: 'RocketLaunchIcon' },
                  { title: 'Building Office', value: 'BuildingOfficeIcon' },
                  { title: 'Globe', value: 'GlobeAltIcon' },
                  { title: 'Heart', value: 'HeartIcon' },
                  { title: 'Trophy', value: 'TrophyIcon' },
                  { title: 'Star', value: 'StarIcon' },
                  { title: 'Light Bulb', value: 'LightBulbIcon' },
                  { title: 'Chart Bar', value: 'ChartBarIcon' },
                  { title: 'Briefcase', value: 'BriefcaseIcon' },
                  { title: 'Chat Bubble', value: 'ChatBubbleLeftRightIcon' },
                  { title: 'Academic Cap', value: 'AcademicCapIcon' },
                  { title: 'Command Line', value: 'CommandLineIcon' },
                  { title: 'CPU Chip', value: 'CpuChipIcon' },
                  { title: 'Code Bracket', value: 'CodeBracketIcon' },
                  { title: 'Signal', value: 'SignalIcon' },
                  { title: 'Camera', value: 'CameraIcon' },
                  { title: 'Microphone', value: 'MicrophoneIcon' },
                  {
                    title: 'Presentation Chart',
                    value: 'PresentationChartBarIcon',
                  },
                  { title: 'Newspaper', value: 'NewspaperIcon' },
                  { title: 'Hand Raised', value: 'HandRaisedIcon' },
                  { title: 'Handshake (Thumb Up)', value: 'HandThumbUpIcon' },
                  { title: 'Check Badge', value: 'CheckBadgeIcon' },
                ],
              },
            }),
          ],
        },
      ],
    }),
    defineField({
      name: 'sponsorshipCustomization',
      title: 'Sponsorship Page Customization',
      type: 'object',
      fieldset: 'sponsorship',
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({
          name: 'heroHeadline',
          type: 'string',
          title: 'Hero Headline',
          initialValue: 'No Sales Pitches. Just Code & Culture.',
        }),
        defineField({
          name: 'heroSubheadline',
          type: 'text',
          title: 'Hero Subheadline',
          initialValue:
            'We prioritize engineering value over marketing fluff. Our audience builds the platforms Norway runs on. Join us in powering the voyage.',
        }),
        defineField({
          name: 'packageSectionTitle',
          type: 'string',
          title: 'Package Section Title',
          initialValue: 'The Base Image',
        }),
        defineField({
          name: 'addonSectionTitle',
          type: 'string',
          title: 'Addon Section Title',
          initialValue: 'Custom Resource Definitions (CRDs)',
        }),
        defineField({
          name: 'philosophyTitle',
          type: 'string',
          title: 'Philosophy Title',
          initialValue: "We Don't Sell Booths. We Build Credibility.",
        }),
        defineField({
          name: 'philosophyDescription',
          type: 'text',
          title: 'Philosophy Description',
          initialValue:
            "We intentionally do not have a traditional Expo Hall. Why? Because the best engineers don't like being sold to in a booth. Instead, we integrate your brand into the fabric of the event through digital hype, on-site signage, and our curated 'Wall of Opportunities'.",
        }),
        defineField({
          name: 'closingQuote',
          type: 'string',
          title: 'Closing Quote',
          initialValue:
            "The best engineers don't apply to job ads; they work for companies they respect.",
        }),
        defineField({
          name: 'closingCtaText',
          type: 'string',
          title: 'Closing CTA Text',
          initialValue: 'git commit -m "Support the Community"',
        }),
        defineField({
          name: 'prospectusUrl',
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
      name: 'featuredSpeakers',
      title: 'Featured Speakers',
      type: 'array',
      fieldset: 'relations',
      of: [{ type: 'reference', to: { type: 'speaker' } }],
      validation: (Rule) => Rule.unique(),
      initialValue: [],
    }),
    defineField({
      name: 'featuredTalks',
      title: 'Featured Talks',
      type: 'array',
      fieldset: 'relations',
      of: [{ type: 'reference', to: { type: 'talk' } }],
      validation: (Rule) => Rule.unique(),
      initialValue: [],
      description: 'Talks to highlight in the Program Highlights section',
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
      startDate: 'startDate',
      endDate: 'endDate',
    },
    prepare(selection) {
      const { title, city, country, startDate, endDate } = selection
      return {
        ...selection,
        title: `${title} - ${city}, ${country} - ${startDate} - ${endDate}`,
      }
    },
  },
})
