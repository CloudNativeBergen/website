import { formats } from '../../src/lib/proposal/types'
import { isValidTeamKey, countTeamKey } from '../../src/lib/teams/validation'
import { defineField, defineType, type FieldDefinition } from 'sanity'
import { HEROICON_OPTIONS } from './constants'

/**
 * One block type in the closed homepage-section registry (front-page builder
 * F1/F2). Every block shares a `hidden` visibility toggle plus any block-specific
 * `fields`; the object `name` is the `_type` discriminator the renderer switches
 * on (see `src/lib/homepage/sections.ts`). The preview shows the friendly title
 * and a "Hidden" flag so organizers can read the composition at a glance.
 */
function defineHomepageSection(
  name: string,
  title: string,
  fields: FieldDefinition[] = [],
) {
  return {
    type: 'object' as const,
    name,
    title,
    fields: [
      defineField({
        name: 'hidden',
        title: 'Hidden',
        type: 'boolean',
        description: 'Hide this section without deleting it.',
        initialValue: false,
      }),
      ...fields,
    ],
    preview: {
      select: { hidden: 'hidden' },
      prepare(selection: { hidden?: boolean }) {
        return {
          title,
          subtitle: selection.hidden ? 'Hidden' : undefined,
        }
      },
    },
  }
}

/**
 * Studio-side mirror of the server `safeLinkHref` rule (defence in depth): a
 * public-page CTA link must be a site path (`/tickets`) or an explicit
 * http(s) URL — `javascript:`, `data:` and scheme-relative `//host` rejected.
 */
const safeLinkRule = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return true // required() handles empty
  const v = value.trim()
  if (v.startsWith('/') && !v.startsWith('//')) return true
  if (/^https?:\/\//i.test(v)) {
    // Prefix alone admits bare 'https://' — require a parseable absolute URL
    // with a host, matching the server rule.
    try {
      const parsed = new URL(v)
      if (parsed.hostname) return true
    } catch {}
  }
  return 'Enter a site path (e.g. /tickets) or a full http(s) URL'
}

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
      name: 'visibility',
      title: 'Visibility & Discovery',
      description:
        'Whether this conference is publicly listed and indexed, or unlisted (reachable by direct link but hidden from search engines).',
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
    {
      name: 'agents',
      title: 'Agent Configuration (AI)',
      options: { collapsible: true, collapsed: true },
    },
    // Front-page builder (F1/F2). Kept in its OWN fieldset at the end of the
    // document to minimise merge conflicts with concurrent branches.
    {
      name: 'homepage',
      title: 'Homepage Composition',
      description:
        'Ordered list of homepage sections. Leave empty to render the default phase-aware layout (hero, gallery, featured speakers / program, sponsors).',
      options: { collapsible: true, collapsed: true },
    },
    // Homepage lifecycle OVERRIDE (F5). Its own fieldset, appended last, for the
    // same merge-conflict reason as `homepage` above.
    {
      name: 'lifecycle',
      title: 'Event Status',
      description:
        'Only for calling an edition off or retiring it for good. Every other state (save-the-date, CFP open, programme published, post-event) is derived from the dates above and needs no switch here.',
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
    // Multi-tenant anchor (CaaS T1-1, #613): the organization (tenant) that owns
    // this conference edition. REQUIRED for new documents via this Studio-only
    // validation rule, but the field itself is nullable on legacy docs until the
    // 044 backfill runs — server code must NOT assume its presence yet.
    defineField({
      name: 'organization',
      title: 'Organization',
      type: 'reference',
      to: [{ type: 'organization' }],
      fieldset: 'basicInfo',
      description:
        'The organization (tenant) that owns this conference edition and all of its scoped documents.',
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
      name: 'organizerOrgNumber',
      title: 'Organizer Org Number',
      type: 'string',
      fieldset: 'basicInfo',
      description:
        'Organization number of the organizer (used in contracts and invoices)',
    }),
    defineField({
      name: 'organizerAddress',
      title: 'Organizer Address',
      type: 'string',
      fieldset: 'basicInfo',
      description:
        'Registered address of the organizer (used in contracts and invoices)',
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

    // === Visibility & Discovery ===
    // M0 trial groundwork: gate a conference's presence on discovery surfaces
    // (sitemap / robots / search indexing) without hiding it from direct
    // visitors. ABSENT is treated as `live` by server code (every legacy
    // conference is public), so this field is intentionally NOT required. The
    // `initialValue` only stamps Studio-CREATED documents — a fresh conference
    // starts unlisted ("build free, pay to activate"); it does NOT affect the
    // absent-means-live rule for existing docs or programmatic writes.
    defineField({
      name: 'visibility',
      title: 'Visibility',
      type: 'string',
      fieldset: 'visibility',
      description:
        'Unlisted: the site renders for direct visitors so you can preview and share it, but it is excluded from sitemaps, robots and search indexing. Live: publicly listed and indexed.',
      options: {
        list: [
          {
            title:
              'Unlisted — reachable by direct link, hidden from search engines',
            value: 'unlisted',
          },
          { title: 'Live — publicly listed and indexed', value: 'live' },
        ],
        layout: 'radio',
      },
      initialValue: 'unlisted',
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
    // Background pattern (go-live gate G2, #643): the decorative page background.
    // ABSENT resolves to 'cloud-native' — the animated CNCF ecosystem logos —
    // so existing tenants are unchanged. Tenants outside the CNCF ecosystem can
    // dial it down ('subtle') or off ('none', a plain gradient).
    defineField({
      name: 'backgroundPattern',
      title: 'Background Pattern',
      type: 'string',
      fieldset: 'branding',
      description:
        'The decorative page background. "Cloud Native" shows the animated CNCF project logos. "Subtle" shows the same logos at a much lower density and opacity. "None" shows a plain gradient with no logos. Leave blank for "Cloud Native".',
      options: {
        list: [
          {
            title: 'Cloud Native — animated CNCF logos',
            value: 'cloud-native',
          },
          { title: 'Subtle — sparse, faint logos', value: 'subtle' },
          { title: 'None — plain gradient, no logos', value: 'none' },
        ],
        layout: 'radio',
      },
    }),
    // Per-tenant brand theme (THEMING L1): an optional design-token override for
    // the primary interactive colour and the gradient accent. ABSENT resolves to
    // the house palette (Cloud Native Days blue) — existing tenants unchanged.
    // Colours are used verbatim; contrast is the editor's responsibility (the
    // admin settings preview shows the result). Edited through the dedicated
    // ThemeEditor island via `conference.updateBranding`.
    defineField({
      name: 'theme',
      title: 'Brand Theme (colors)',
      type: 'object',
      fieldset: 'branding',
      description:
        'Optional per-conference brand colors. Leave unset to use the default Cloud Native Days palette.',
      // Both-or-neither: the server schema and the ThemeEditor treat the theme
      // as a complete pair, so a Studio edit must not persist a half-theme.
      validation: (rule) =>
        rule.custom(
          (
            value: { primaryColor?: string; accentColor?: string } | undefined,
          ) => {
            if (!value) return true
            if (Boolean(value.primaryColor) !== Boolean(value.accentColor)) {
              return 'Set both the primary and the accent color — or clear both'
            }
            return true
          },
        ),
      fields: [
        defineField({
          name: 'primaryColor',
          title: 'Primary Color',
          type: 'string',
          description:
            'Primary interactive color (buttons, links, focus rings) and gradient start. 6-digit hex, e.g. #1D4ED8.',
          validation: (rule) =>
            rule
              .regex(/^#[0-9a-fA-F]{6}$/, {
                name: 'hex color',
                invert: false,
              })
              .error('Enter a 6-digit hex color, e.g. #1D4ED8'),
        }),
        defineField({
          name: 'accentColor',
          title: 'Accent Color',
          type: 'string',
          description:
            'Gradient endpoint / accent color. 6-digit hex, e.g. #06B6D4.',
          validation: (rule) =>
            rule
              .regex(/^#[0-9a-fA-F]{6}$/, {
                name: 'hex color',
                invert: false,
              })
              .error('Enter a 6-digit hex color, e.g. #06B6D4'),
        }),
      ],
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
    // Provider selector (CaaS, Tito second-provider proof): which ticketing
    // vendor backs this conference. ABSENT is treated as 'checkin' by server
    // code (every legacy conference), so this is intentionally NOT required and
    // has no initialValue that would change existing documents.
    defineField({
      name: 'ticketingProvider',
      title: 'Ticketing Provider',
      type: 'string',
      fieldset: 'ticketing',
      description:
        'Which ticketing vendor backs this conference. Leave blank for Checkin.no (the default). Choose Tito to use the Tito account/event slugs below.',
      options: {
        list: [
          { title: 'Checkin.no (default)', value: 'checkin' },
          { title: 'Tito (ti.to)', value: 'tito' },
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'checkinCustomerId',
      title: 'Checkin.no Customer ID',
      type: 'number',
      fieldset: 'ticketing',
      description: 'Customer ID for Checkin.no API integration',
      hidden: ({ parent }) => parent?.ticketingProvider === 'tito',
    }),
    defineField({
      name: 'checkinEventId',
      title: 'Checkin.no Event ID',
      type: 'number',
      fieldset: 'ticketing',
      description: 'Event ID for Checkin.no API integration',
      hidden: ({ parent }) => parent?.ticketingProvider === 'tito',
    }),
    // Tito binding: the two URL slugs of the event on ti.to. For an event at
    // `https://ti.to/ultimateconf/2026`, account slug = "ultimateconf",
    // event slug = "2026". The API token itself is NOT stored here — it is a
    // tenant secret (TITO_API_KEY / per-org ticketing secret).
    defineField({
      name: 'titoAccountSlug',
      title: 'Tito Account Slug',
      type: 'string',
      fieldset: 'ticketing',
      description:
        'Tito account slug (e.g. "ultimateconf" in ti.to/ultimateconf/2026).',
      hidden: ({ parent }) => parent?.ticketingProvider !== 'tito',
    }),
    defineField({
      name: 'titoEventSlug',
      title: 'Tito Event Slug',
      type: 'string',
      fieldset: 'ticketing',
      description: 'Tito event slug (e.g. "2026" in ti.to/ultimateconf/2026).',
      hidden: ({ parent }) => parent?.ticketingProvider !== 'tito',
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
                list: [...HEROICON_OPTIONS],
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
    defineField({
      name: 'teams',
      title: 'Organizer Teams',
      type: 'array',
      fieldset: 'communication',
      description:
        'Optional sub-teams of organizers used as a SOFT LENS for routing notifications and outbound mail — never an access-control boundary. When no teams are defined, all organizers receive everything (today’s behaviour). Well-known keys: cfp, sponsors, volunteers, workshops (additional keys are allowed).',
      of: [
        {
          type: 'object',
          name: 'organizerTeam',
          fields: [
            defineField({
              name: 'key',
              title: 'Key',
              type: 'string',
              description:
                'Stable lowercase kebab-case identifier (e.g. "cfp", "sponsors"). Used by notification routing; must be unique within this list.',
              validation: (Rule) =>
                Rule.required().custom((value, context) => {
                  if (typeof value !== 'string' || value.length === 0) {
                    return 'Key is required'
                  }
                  if (!isValidTeamKey(value)) {
                    return 'Key must be lowercase kebab-case (letters, numbers and single hyphens)'
                  }
                  // Uniqueness within the array. Cross-field validation is done
                  // by counting siblings on the parent document; Sanity has no
                  // built-in per-field array-unique rule.
                  const teams = (
                    context?.document as { teams?: Array<{ key?: string }> }
                  )?.teams
                  if (countTeamKey(teams, value) > 1) {
                    return `Duplicate team key "${value}" — keys must be unique`
                  }
                  return true
                }),
            }),
            defineField({
              name: 'title',
              title: 'Title',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'members',
              title: 'Members',
              type: 'array',
              description:
                'Organizers on this team. Filtered to this conference’s organizers; membership is documented as a subset of organizers but not enforced cross-field.',
              of: [
                {
                  type: 'reference',
                  to: [{ type: 'speaker' }],
                  options: {
                    // Mirror sponsorForConference.assignedTo’s conference-scoped
                    // organizer filter, but scope to THIS conference document’s
                    // own _id (strip the drafts. prefix so it matches the
                    // published organizers[] refs).
                    filter: ({ document }: { document: { _id?: string } }) => {
                      const id = document?._id?.replace(/^drafts\./, '')
                      if (!id) {
                        return {
                          filter:
                            '_id in *[_type == "conference"].organizers[]._ref',
                        }
                      }
                      return {
                        filter:
                          '_id in *[_type == "conference" && _id == $conferenceId][0].organizers[]._ref',
                        params: { conferenceId: id },
                      }
                    },
                  },
                },
              ],
              validation: (Rule) => Rule.required().min(1).unique(),
            }),
            defineField({
              name: 'slackChannel',
              title: 'Slack Channel',
              type: 'string',
              description:
                'Overrides the conference-level channel for this team’s notifications; falls back to cfpNotificationChannel / salesNotificationChannel per event kind.',
            }),
            defineField({
              name: 'emailIdentity',
              title: 'Email Identity',
              type: 'array',
              of: [{ type: 'string' }],
              options: {
                list: [
                  { title: 'Contact Email', value: 'contactEmail' },
                  { title: 'CFP Email', value: 'cfpEmail' },
                  { title: 'Sponsor Email', value: 'sponsorEmail' },
                ],
              },
              description:
                'Which conference email identity this team’s outbound mail uses. Falls back to the conference default when unset.',
            }),
          ],
          preview: {
            select: {
              title: 'title',
              key: 'key',
              members: 'members',
            },
            prepare(selection) {
              const { title, key, members } = selection as {
                title?: string
                key?: string
                members?: unknown[]
              }
              const count = Array.isArray(members) ? members.length : 0
              return {
                title: title || key || 'Team',
                subtitle: `${key ? `${key} · ` : ''}${count} member${count === 1 ? '' : 's'}`,
              }
            },
          },
        },
      ],
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
                list: [...HEROICON_OPTIONS],
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
    defineField({
      name: 'crmInactivityThresholds',
      title: 'CRM Inactivity Thresholds',
      type: 'array',
      fieldset: 'sponsorship',
      description: 'Thresholds for marking sponsors as needing follow-up',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'stateType',
              title: 'State Type',
              type: 'string',
              options: {
                list: [
                  { title: 'Status', value: 'status' },
                  { title: 'Contract Status', value: 'contractStatus' },
                  { title: 'Invoice Status', value: 'invoiceStatus' },
                ],
              },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'stateValue',
              title: 'State Value',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'days',
              title: 'Days',
              type: 'number',
              validation: (Rule) => Rule.required().min(1),
            }),
          ],
        },
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

    // === Agent Configuration ===
    defineField({
      name: 'agentConfig',
      title: 'Agent Configuration',
      type: 'object',
      fieldset: 'agents',
      description:
        'Configuration for AI agents (Proposal Reviewers, CRM Agents, etc.)',
      fields: [
        defineField({
          name: 'conferenceContext',
          title: 'Conference Context',
          type: 'text',
          rows: 5,
          description:
            'What is the conference about? (Goals, purpose, scope, audience). This helps agents understand the general mission.',
        }),
        defineField({
          name: 'proposalReviewConfig',
          title: 'Proposal Review Configuration',
          type: 'text',
          rows: 5,
          description:
            'Criteria and instructions for proposal review agents. How should they judge submissions? What specific topics or qualities are preferred?',
        }),
        defineField({
          name: 'sponsorCrmConfig',
          title: 'Sponsor CRM Configuration',
          type: 'text',
          rows: 5,
          description:
            'Behavior and interaction rules for CRM sponsor agents. How should they behave and interact when communicating with sponsors?',
        }),
      ],
    }),

    // === Homepage Composition (front-page builder F1/F2) ===
    // A CLOSED registry of typed section blocks. ABSENT/empty renders the legacy
    // phase-aware default (see `src/lib/homepage/sections.ts`
    // `getDefaultSections`). Each block's `_type` is the discriminator; content
    // still comes from the existing conference sources — sections carry only
    // their own presentation config. There is no raw-HTML/embed block by design.
    defineField({
      name: 'homepageSections',
      title: 'Homepage Sections',
      type: 'array',
      fieldset: 'homepage',
      description:
        'Ordered homepage blocks. Leave empty for the default layout. Each block still pulls its content (featured speakers, schedule, sponsors, gallery) from the existing conference configuration.',
      of: [
        defineHomepageSection('homepageHero', 'Hero', [
          defineField({
            name: 'heroHeadline',
            title: 'Headline Override',
            type: 'string',
            description:
              'Overrides the tagline in the hero. Leave blank to keep the smart default (with the animated tagline where configured).',
          }),
          defineField({
            name: 'heroSubheadline',
            title: 'Subheadline Override',
            type: 'text',
            rows: 3,
            description:
              'Overrides the hero description. Leave blank to use the conference description.',
          }),
          defineField({
            name: 'ctaOverrides',
            title: 'CTA Button Overrides',
            type: 'array',
            description:
              'When set, replaces the phase-aware hero buttons. Leave empty to keep the smart CFP/tickets/info buttons.',
            of: [
              {
                type: 'object',
                name: 'heroCta',
                fields: [
                  defineField({
                    name: 'label',
                    title: 'Label',
                    type: 'string',
                    validation: (Rule) => Rule.required(),
                  }),
                  defineField({
                    name: 'href',
                    title: 'Link',
                    type: 'string',
                    validation: (Rule) => Rule.required().custom(safeLinkRule),
                  }),
                ],
                preview: { select: { title: 'label', subtitle: 'href' } },
              },
            ],
          }),
        ]),
        defineHomepageSection('homepageSaveTheDate', 'Save the Date', [
          defineField({
            name: 'heading',
            title: 'Heading',
            type: 'string',
            description: 'Optional heading. Defaults to "Save the date".',
          }),
          defineField({
            name: 'description',
            title: 'Description',
            type: 'text',
            rows: 2,
            description:
              'Optional extra copy. There is no default: the card already shows the dates, the venue and city, a countdown and the milestone list, so leaving this empty simply adds no extra line.',
          }),
        ]),
        defineHomepageSection('homepageFeaturedSpeakers', 'Featured Speakers', [
          defineField({
            name: 'heading',
            title: 'Heading',
            type: 'string',
            description:
              'Optional heading. Defaults to "Featured Speakers". The speakers themselves come from the conference configuration.',
          }),
          defineField({
            name: 'description',
            title: 'Sub-heading',
            type: 'text',
            rows: 2,
            description:
              'Optional copy under the heading. Defaults to "Meet the speakers at <conference title>".',
          }),
        ]),
        defineHomepageSection(
          'homepageProgramHighlights',
          'Program Highlights',
        ),
        defineHomepageSection('homepageOrganizers', 'Organizers', [
          defineField({
            name: 'heading',
            title: 'Heading',
            type: 'string',
            description: 'Optional heading. Defaults to "Meet Our Organizers".',
          }),
          defineField({
            name: 'description',
            title: 'Sub-heading',
            type: 'text',
            rows: 2,
            description:
              'Optional copy under the heading. Defaults to "The passionate team driving <conference title>".',
          }),
        ]),
        defineHomepageSection('homepageSponsors', 'Sponsors', [
          defineField({
            name: 'heading',
            title: 'Heading',
            type: 'string',
            description: 'Optional heading. Defaults to "Our sponsors".',
          }),
          defineField({
            name: 'description',
            title: 'Sub-heading',
            type: 'text',
            rows: 2,
            description:
              'Optional copy under the heading. Leave blank for the house default.',
          }),
          defineField({
            name: 'showCta',
            title: 'Show the “Become a Sponsor” card',
            type: 'boolean',
            initialValue: true,
            description:
              'Turn off to drop the prospective-sponsor call-to-action below the logos.',
          }),
          defineField({
            name: 'ctaHeading',
            title: 'Call-to-action Heading',
            type: 'string',
            hidden: ({ parent }) =>
              (parent as { showCta?: boolean })?.showCta === false,
            description: 'Optional. Defaults to "Become a Sponsor".',
          }),
          defineField({
            name: 'ctaDescription',
            title: 'Call-to-action Body',
            type: 'text',
            rows: 3,
            hidden: ({ parent }) =>
              (parent as { showCta?: boolean })?.showCta === false,
            description:
              'Optional pitch to prospective sponsors. Leave blank for the house default.',
          }),
        ]),
        defineHomepageSection('homepageGallery', 'Photo Gallery', [
          defineField({
            name: 'heading',
            title: 'Heading',
            type: 'string',
            description: 'Optional heading. Defaults to "Conference Moments".',
          }),
          defineField({
            name: 'description',
            title: 'Sub-heading',
            type: 'text',
            rows: 3,
            description:
              'Optional copy under the heading. Leave blank for the house default.',
          }),
        ]),
        defineHomepageSection('homepageMetrics', 'Vanity Metrics', [
          defineField({
            name: 'heading',
            title: 'Heading',
            type: 'string',
            description: 'Optional heading above the metrics band.',
          }),
        ]),
        defineHomepageSection('homepageCtaBanner', 'Call-to-action Banner', [
          defineField({
            name: 'heading',
            title: 'Heading',
            type: 'string',
            validation: (Rule) => Rule.required(),
          }),
          defineField({
            name: 'body',
            title: 'Body',
            type: 'text',
            rows: 2,
          }),
          defineField({
            name: 'buttonLabel',
            title: 'Button Label',
            type: 'string',
            validation: (Rule) => Rule.required(),
          }),
          defineField({
            name: 'buttonHref',
            title: 'Button Link',
            type: 'string',
            validation: (Rule) => Rule.required().custom(safeLinkRule),
          }),
        ]),
        defineHomepageSection('homepageRichText', 'Rich Text', [
          defineField({
            name: 'heading',
            title: 'Heading',
            type: 'string',
            description: 'Optional heading above the rich text.',
          }),
          defineField({
            name: 'content',
            title: 'Content',
            type: 'array',
            of: [{ type: 'block' }],
            validation: (Rule) => Rule.required(),
          }),
        ]),
        defineHomepageSection('homepageFaq', 'FAQ', [
          defineField({
            name: 'heading',
            title: 'Heading',
            type: 'string',
            description:
              'Optional heading. Defaults to "Frequently asked questions".',
          }),
          defineField({
            name: 'source',
            title: 'Source',
            type: 'string',
            initialValue: 'own',
            options: {
              list: [
                { title: 'This block’s own items', value: 'own' },
                { title: 'Ticket FAQs (reuse existing)', value: 'ticketFaqs' },
              ],
              layout: 'radio',
            },
            description:
              'Reuse the ticket FAQs instead of duplicating them, or curate your own list below.',
          }),
          defineField({
            name: 'items',
            title: 'FAQ Items',
            type: 'array',
            hidden: ({ parent }) =>
              (parent as { source?: string })?.source === 'ticketFaqs',
            of: [
              {
                type: 'object',
                name: 'homepageFaqItem',
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
                    rows: 3,
                    validation: (Rule) => Rule.required(),
                  }),
                ],
                preview: { select: { title: 'question', subtitle: 'answer' } },
              },
            ],
          }),
        ]),
        defineHomepageSection('homepageCountdown', 'Countdown', [
          defineField({
            name: 'heading',
            title: 'Heading',
            type: 'string',
            description: 'Optional heading above the countdown.',
          }),
          defineField({
            name: 'targetOverride',
            title: 'Target Date/Time Override',
            type: 'datetime',
            description:
              'Leave blank to count down to the conference start date.',
          }),
          defineField({
            name: 'liveMessage',
            title: 'Live Message',
            type: 'string',
            description:
              'Shown once the countdown reaches zero. Leave blank to hide the block afterwards.',
          }),
        ]),
        defineHomepageSection('homepageVenue', 'Venue', [
          defineField({
            name: 'heading',
            title: 'Heading',
            type: 'string',
            description: 'Optional heading. Defaults to "Venue".',
          }),
          defineField({
            name: 'description',
            title: 'Description',
            type: 'text',
            rows: 2,
            description: 'Optional copy shown above the venue card.',
          }),
        ]),
      ],
    }),

    // === Event Status (homepage lifecycle override) ===
    // ABSENT is the norm: the homepage derives its stage from the CFP,
    // programme and event dates. These fields exist ONLY for the two states no
    // date can imply. Setting one REPLACES the homepage with a notice — it is
    // not a banner above the usual page — so a cancelled event can never show a
    // ticket CTA.
    defineField({
      name: 'lifecycleStatus',
      title: 'Event Status',
      type: 'string',
      fieldset: 'lifecycle',
      description:
        'Leave unset for a normal event. Cancelled and Archived each REPLACE the homepage with a notice.',
      options: {
        list: [
          {
            title: 'Cancelled — this edition is not happening',
            value: 'cancelled',
          },
          {
            title: 'Archived — the event has ended for good',
            value: 'archived',
          },
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'lifecycleHeadline',
      title: 'Status Headline',
      type: 'string',
      fieldset: 'lifecycle',
      description:
        'Optional. Leave blank for a sensible default built from the conference title.',
    }),
    defineField({
      name: 'lifecycleMessage',
      title: 'Status Message',
      type: 'text',
      rows: 4,
      fieldset: 'lifecycle',
      description:
        'What happened, and what a visitor should do next (refunds, the next edition, where to ask). Blank falls back to house copy.',
    }),
    defineField({
      name: 'lifecycleLinkLabel',
      title: 'Status Link Label',
      type: 'string',
      fieldset: 'lifecycle',
      description:
        'Optional single link on the notice, e.g. "Read the full statement" or "Browse the archive".',
    }),
    defineField({
      name: 'lifecycleLinkHref',
      title: 'Status Link URL',
      type: 'string',
      fieldset: 'lifecycle',
      validation: (Rule) => Rule.custom(safeLinkRule),
      description: 'A site path (e.g. /info) or a full http(s) URL.',
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
