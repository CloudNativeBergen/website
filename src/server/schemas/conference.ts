import { z } from 'zod'
import { HEX_COLOR_RE } from '@/lib/branding/theme'
import { Format } from '@/lib/proposal/types'
import { HEROICON_OPTIONS } from '../../../sanity/schemaTypes/constants'
import { isValidDomainEntry, normalizeDomain } from '@/lib/conference/domains'
import { isValidTeamKey } from '@/lib/teams/validation'
import { CLONE_FAMILIES } from '@/lib/conference/edition'
import {
  CONFERENCE_VISIBILITY_VALUES,
  type ConferenceVisibility,
} from '@/lib/conference/visibility'
import {
  BACKGROUND_PATTERN_VALUES,
  type BackgroundPattern,
} from '@/lib/conference/backgroundPattern'

/**
 * Field-scoped conference settings schemas (SE-1a + SE-1b). Each schema mirrors
 * ONE fieldset group from `sanity/schemaTypes/conference.ts` and is consumed by
 * exactly one mutation in `src/server/routers/conference.ts`.
 *
 * SE-1a covered SCALAR field groups. SE-1b adds the array/object groups:
 * `socialLinks`, `features`, `vanityMetrics`, `sponsorBenefits`,
 * `sponsorshipCustomization` and the safeguarded `domains`. Still excluded:
 * teams, organizers, topics, announcement, logos (later phases).
 *
 * UNSET SEMANTICS (shared across scalar schemas): a field left `undefined` is
 * untouched; an explicit `null` unsets the (optional) field. Array schemas set
 * the WHOLE array (a full replace); the object schema patches field-scoped dot
 * paths under its parent. The router's patch builder translates these to Sanity
 * `.set()` / `.unset()` — see `applyConferencePatch`.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const dateString = z
  .string()
  .regex(DATE_RE, 'Date must be in YYYY-MM-DD format')

// === Basic Information ===
export const UpdateBasicInfoSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  organizer: z.string().trim().min(1, 'Organizer is required'),
  city: z.string().trim().nullable().optional(),
  country: z.string().trim().nullable().optional(),
  tagline: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
})

// === Visibility (M0 trial state) ===
// A single required enum — the ONLY value that opts a conference out of
// discovery is the explicit `'unlisted'`; server code treats absent as `'live'`
// (see `@/lib/conference/visibility`). The mutation always sets an explicit
// value, so the field is never left absent once an organizer has touched it.
export const UpdateVisibilitySchema = z.object({
  // Cast the shared readonly values to zod's mutable-tuple shape WHILE preserving
  // the literal union (`'unlisted' | 'live'`), so the inferred input type is the
  // narrow union rather than `string`.
  visibility: z.enum(
    CONFERENCE_VISIBILITY_VALUES as unknown as [
      ConferenceVisibility,
      ...ConferenceVisibility[],
    ],
  ),
})

// === Venue ===
export const UpdateVenueSchema = z.object({
  venueName: z.string().trim().nullable().optional(),
  venueAddress: z.string().trim().nullable().optional(),
})

// === Branding (background pattern + brand theme) ===
// The logo slots are edited through the dedicated BrandingEditor/updateBrandingLogo
// path. This fieldset carries the decorative background switch (go-live gate G2,
// #643) AND the optional per-tenant brand theme (THEMING L1).
//
// `backgroundPattern` is now OPTIONAL so the two editors that share this mutation
// can each patch just their own field: the generic branding fieldset sends
// `backgroundPattern` alone, the ThemeEditor sends `theme` alone. `undefined`
// leaves a field untouched (see UNSET SEMANTICS); the renderer still treats an
// absent stored pattern as `'cloud-native'`.
//
// `theme` is a whole-object override: present → set `{ primaryColor, accentColor }`,
// explicit `null` → unset (revert to the house palette). Both colours must be
// 6-digit hex — non-hex is REJECTED (validated here, the write-path authority).
// The regex is shared with the runtime guard via the theming core's
// HEX_COLOR_RE; the Sanity rule inlines an intentionally identical pattern
// (schema files stay import-light) — keep them in sync if it ever changes.
const hexColor = z
  .string()
  .trim()
  .regex(HEX_COLOR_RE, 'Enter a 6-digit hex color, e.g. #1D4ED8')

export const ConferenceThemeSchema = z.object({
  primaryColor: hexColor,
  accentColor: hexColor,
})

export const UpdateBrandingSchema = z.object({
  backgroundPattern: z
    .enum(
      BACKGROUND_PATTERN_VALUES as unknown as [
        BackgroundPattern,
        ...BackgroundPattern[],
      ],
    )
    .optional(),
  theme: ConferenceThemeSchema.nullable().optional(),
})

// === Dates ===
export const UpdateDatesSchema = z
  .object({
    startDate: dateString,
    endDate: dateString,
    cfpStartDate: dateString,
    cfpEndDate: dateString,
    cfpNotifyDate: dateString,
    programDate: dateString,
    travelSupportPaymentDate: dateString.nullable().optional(),
    travelSupportBudget: z
      .number()
      .min(0, 'Budget must be zero or more')
      .nullable()
      .optional(),
  })
  // YYYY-MM-DD compares correctly with lexical `<`, so ordering needs no Date
  // parsing. Guarded on presence so the rule only fires "when both provided".
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  })
  .refine(
    (d) => !d.cfpStartDate || !d.cfpEndDate || d.cfpEndDate >= d.cfpStartDate,
    {
      message: 'CFP end date must be on or after the CFP start date',
      path: ['cfpEndDate'],
    },
  )

// === Registration ===
export const UpdateRegistrationSchema = z.object({
  registrationLink: z
    .string()
    .trim()
    .url('Enter a valid URL')
    .nullable()
    .optional(),
  registrationEnabled: z.boolean(),
})

// === Communication ===
// The three emails drive outbound from-addresses, so they are required and must
// be valid. The two Slack channels are optional free-form strings; a leading `#`
// is tolerated (stored verbatim — callers already normalize on read).
export const UpdateCommunicationSchema = z.object({
  contactEmail: z
    .string()
    .trim()
    .min(1, 'Contact email is required')
    .email('Enter a valid email address'),
  cfpEmail: z
    .string()
    .trim()
    .min(1, 'CFP email is required')
    .email('Enter a valid email address'),
  sponsorEmail: z
    .string()
    .trim()
    .min(1, 'Sponsor email is required')
    .email('Enter a valid email address'),
  salesNotificationChannel: z.string().trim().nullable().optional(),
  cfpNotificationChannel: z.string().trim().nullable().optional(),
})

// === Ticketing IDs ===
// Positive integers; clearing is allowed by sending `null` (unset).
// Provider-discriminated: `ticketingProvider` selects the vendor (absent/null ⇒
// Checkin). Checkin uses the numeric ids; Tito uses the two account/event slugs.
export const UpdateTicketingIdsSchema = z
  .object({
    ticketingProvider: z.enum(['checkin', 'tito']).nullable().optional(),
    checkinCustomerId: z
      .number()
      .int('Must be a whole number')
      .positive('Must be a positive number')
      .nullable()
      .optional(),
    checkinEventId: z
      .number()
      .int('Must be a whole number')
      .positive('Must be a positive number')
      .nullable()
      .optional(),
    titoAccountSlug: z.string().trim().nullable().optional(),
    titoEventSlug: z.string().trim().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    // A Tito binding is both-or-neither: the resolver requires account AND event
    // slug, so persisting one alone would strand the conference in a
    // half-configured state that silently resolves as "unconfigured".
    const hasAnySlug =
      Boolean(value.titoAccountSlug) || Boolean(value.titoEventSlug)
    if (value.ticketingProvider !== 'tito' && !hasAnySlug) return
    if (Boolean(value.titoAccountSlug) !== Boolean(value.titoEventSlug)) {
      const missing = value.titoAccountSlug
        ? 'titoEventSlug'
        : 'titoAccountSlug'
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [missing],
        message:
          'Tito needs both the account slug and the event slug — set both or clear both',
      })
    }
    // Slugs saved while the provider is (or defaults to) Checkin would be
    // silently ignored by the resolver (absence ⇒ 'checkin') — a stored-but-dead
    // binding. The fieldset is full-replace, so requiring the provider here is
    // safe for every caller.
    if (hasAnySlug && value.ticketingProvider !== 'tito') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ticketingProvider'],
        message:
          'Select Tito as the ticketing provider to use these slugs — or clear them',
      })
    }
  })

// === CFP & Revenue Goals ===
// Non-negative numbers; every field is optional and unsettable via `null`.
const nonNegativeGoal = z
  .number()
  .min(0, 'Must be zero or more')
  .nullable()
  .optional()

export const UpdateCfpGoalsSchema = z.object({
  cfpSubmissionGoal: nonNegativeGoal,
  cfpLightningGoal: nonNegativeGoal,
  cfpPresentationGoal: nonNegativeGoal,
  cfpWorkshopGoal: nonNegativeGoal,
  sponsorRevenueGoal: nonNegativeGoal,
})

// === Social Links (array of URL strings) ===
// A full-array replace. Empty list allowed (the field is optional). Every row
// must be a valid URL — blank rows are a client concern (stripped before send).
export const UpdateSocialLinksSchema = z.object({
  socialLinks: z.array(z.string().trim().url('Enter a valid URL')),
})

// === Vanity Metrics (array of {label, value}) ===
// Both fields required per row; empty list allowed.
export const UpdateVanityMetricsSchema = z.object({
  vanityMetrics: z.array(
    z.object({
      label: z.string().trim().min(1, 'Label is required'),
      value: z.string().trim().min(1, 'Value is required'),
      _key: z.string().optional(),
    }),
  ),
})

// === Sponsor Benefits (array of {title, description, icon?}) ===
// `icon` is an optional Heroicon key constrained to the shared `HEROICON_OPTIONS`
// list the public "Why Sponsor" section renders (a `<select>` on the client).
const HEROICON_VALUES = HEROICON_OPTIONS.map((o) => o.value) as [
  string,
  ...string[],
]
export const UpdateSponsorBenefitsSchema = z.object({
  sponsorBenefits: z.array(
    z.object({
      title: z.string().trim().min(1, 'Title is required'),
      description: z.string().trim().min(1, 'Description is required'),
      icon: z
        .enum(HEROICON_VALUES)
        .nullable()
        .optional()
        // Treat an empty select as "no icon".
        .or(z.literal('').transform(() => undefined)),
      _key: z.string().optional(),
    }),
  ),
})

// === Sponsorship Page Customization (object of string fields) ===
// Flattened: the mutation patches field-scoped dot paths
// (`sponsorshipCustomization.<field>`) under a `setIfMissing` parent, so it never
// clobbers sibling subfields it doesn't know about. Every field optional;
// `null`/empty unsets that subfield.
const optionalText = z.string().trim().nullable().optional()
export const UpdateSponsorshipCustomizationSchema = z.object({
  heroHeadline: optionalText,
  heroSubheadline: optionalText,
  packageSectionTitle: optionalText,
  addonSectionTitle: optionalText,
  philosophyTitle: optionalText,
  philosophyDescription: optionalText,
  closingQuote: optionalText,
  closingCtaText: optionalText,
  prospectusUrl: z
    .string()
    .trim()
    .url('Enter a valid URL')
    .nullable()
    .optional(),
})

// === Domains (SAFEGUARDED array of hostname strings) ===
// Drives domain→conference routing. Non-empty ALWAYS; each entry a bare,
// lowercase hostname (scheme/path rejected; dev `:port` allowed); no duplicates.
// The current-request-host guard lives in the router (it needs the request
// headers) — see `updateDomains`.
export const UpdateDomainsSchema = z.object({
  domains: z
    .array(z.string())
    .min(1, 'At least one domain is required')
    .transform((list) => list.map(normalizeDomain))
    .superRefine((list, ctx) => {
      const seen = new Set<string>()
      list.forEach((entry, i) => {
        if (entry === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Domain cannot be empty',
            path: [i],
          })
          return
        }
        if (!isValidDomainEntry(entry)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Enter a bare hostname (no https://, no path), e.g. example.com',
            path: [i],
          })
        }
        if (seen.has(entry)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate domain "${entry}"`,
            path: [i],
          })
        }
        seen.add(entry)
      })
    }),
})

// === SE-2: reference arrays, teams & rich text ===========================

/**
 * A speaker `_id`. References are stored by the router as
 * `{ _type: 'reference', _ref: <id>, _key }` — the client only ever sends the
 * id string, never a whole reference object.
 */
const documentId = z.string().trim().min(1, 'An id is required')

/**
 * Organizers — the CANONICAL organizer set (auth + notification fan-out). A full
 * replace of the reference array. Non-empty ALWAYS and de-duplicated. The
 * self-lockout guard (the acting organizer may not remove themselves) needs the
 * caller identity, so it lives in the router — see `updateOrganizers`.
 */
export const UpdateOrganizersSchema = z.object({
  organizers: z
    .array(documentId)
    .min(1, 'At least one organizer is required')
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Organizers must be unique',
    }),
})

/**
 * Topics — the conference's `topics[]` reference array. Mirrors the Sanity
 * schema's `required().min(1).unique()`: at least one, no duplicates.
 */
export const UpdateTopicsSchema = z.object({
  topics: z
    .array(documentId)
    .min(1, 'At least one topic is required')
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Topics must be unique',
    }),
})

/**
 * Formats — the conference's `formats[]` array of canonical format KEYS (plain
 * strings, not references). Mirrors the Sanity schema's `required().min(1)
 * .unique()` and its enum-constrained `of`: at least one, no duplicates, and
 * every entry a known {@link Format}. A full-array replace.
 */
export const UpdateFormatsSchema = z.object({
  formats: z
    .array(z.nativeEnum(Format))
    .min(1, 'At least one format is required')
    .refine((keys) => new Set(keys).size === keys.length, {
      message: 'Formats must be unique',
    }),
})

/** The conference email identities a team's outbound mail may be sent as. */
const TEAM_EMAIL_IDENTITIES = [
  'contactEmail',
  'cfpEmail',
  'sponsorEmail',
] as const

/**
 * Organizer teams — the `teams[]` object array (a SOFT LENS for routing, never
 * an access boundary — see `src/lib/teams`). Full-array replace. Per team:
 *   - `key`      lowercase kebab-case, UNIQUE within the list (checked below).
 *   - `title`    required.
 *   - `members`  ≥1 speaker ids; the SUBSET-of-organizers rule needs the current
 *                organizer set, so it is enforced in the router.
 *   - `slackChannel`  optional free text.
 *   - `emailIdentity` 0..n of the three conference identities (the UI offers a
 *                single select, but the field is an array per the Sanity schema).
 */
export const UpdateTeamsSchema = z.object({
  teams: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .min(1, 'Key is required')
          .refine(isValidTeamKey, {
            message:
              'Key must be lowercase kebab-case (letters, numbers and single hyphens)',
          }),
        title: z.string().trim().min(1, 'Title is required'),
        members: z
          .array(documentId)
          .min(1, 'A team needs at least one member')
          .refine((ids) => new Set(ids).size === ids.length, {
            message: 'Team members must be unique',
          }),
        slackChannel: z.string().trim().nullable().optional(),
        emailIdentity: z.array(z.enum(TEAM_EMAIL_IDENTITIES)).optional(),
        _key: z.string().optional(),
      }),
    )
    .superRefine((teams, ctx) => {
      const seen = new Set<string>()
      teams.forEach((team, i) => {
        if (seen.has(team.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate team key "${team.key}" — keys must be unique`,
            path: [i, 'key'],
          })
        }
        seen.add(team.key)
      })
    }),
})

/**
 * Announcement — the portable-text `announcement` field shown on the landing
 * page (see `Hero.tsx`). A full replace; an empty/omitted array UNSETS the field
 * (`null`) so the announcement banner stops rendering. Blocks are validated
 * loosely (each carries a `_type`) — the shape is owned by the shared
 * `PortableTextEditor`, whose schema (h1-h3, strong/em/underline, bullet/number
 * lists, link) is the source of truth.
 */
const PortableTextBlockSchema = z
  .object({ _type: z.string().min(1) })
  .catchall(z.unknown())

export const UpdateAnnouncementSchema = z.object({
  announcement: z.array(PortableTextBlockSchema).nullable(),
})

/**
 * Branding logos (SE-3) — the four `inlineSvg` slots on the conference document
 * (`logoBright`, `logoDark`, `logomarkBright`, `logomarkDark`). Each stores raw
 * SVG markup as a string (the render path, {@link InlineSvg}, expects a string),
 * so the mutation patches ONE slot at a time. `svg: null` UNSETS the slot; a
 * string is sanitized SERVER-SIDE (`sanitizeSvgFieldOrThrow`) before it is
 * stored — the Zod schema only checks the shape, never trusts the markup.
 */
export const BRANDING_SLOTS = [
  'logoBright',
  'logoDark',
  'logomarkBright',
  'logomarkDark',
] as const

export type BrandingSlot = (typeof BRANDING_SLOTS)[number]

export const UpdateBrandingLogoSchema = z.object({
  slot: z.enum(BRANDING_SLOTS),
  svg: z.string().nullable(),
})

/** Dry-run preview: sanitize markup without persisting anything. */
export const SanitizeSvgPreviewSchema = z.object({
  svg: z.string(),
})

// === SE-5: create-next-edition wizard ====================================

/**
 * A `domains[]` list for a NEW edition. Non-empty; each a bare, lowercase,
 * unique hostname (scheme/path rejected). GLOBAL uniqueness — that no OTHER
 * conference already claims a domain — needs the datastore and is enforced in
 * the router (`createEdition` / `validateNewDomains`), never here.
 */
const NewEditionDomains = z
  .array(z.string())
  .min(1, 'At least one domain is required')
  .transform((list) => list.map(normalizeDomain))
  .superRefine((list, ctx) => {
    const seen = new Set<string>()
    list.forEach((entry, i) => {
      if (entry === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Domain cannot be empty',
          path: [i],
        })
        return
      }
      if (!isValidDomainEntry(entry)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Enter a bare hostname (no https://, no path), e.g. example.com',
          path: [i],
        })
      }
      if (seen.has(entry)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate domain "${entry}"`,
          path: [i],
        })
      }
      seen.add(entry)
    })
  })

/** Availability probe for the wizard's Domains step (no writes). */
export const ValidateNewDomainsSchema = z.object({
  domains: z.array(z.string()),
})

const optionalDateString = dateString.nullable().optional()

/** The clone-flag object: one boolean per structural family. */
const CloneFlagsSchema = z.object(
  Object.fromEntries(CLONE_FAMILIES.map((f) => [f, z.boolean()])) as Record<
    (typeof CLONE_FAMILIES)[number],
    z.ZodBoolean
  >,
)

/**
 * `conference.createEdition` input. `title`, both event dates and a non-empty
 * `domains` list are required; the organizer name and the CFP/program dates are
 * optional (blank → the field is simply left unset on the new document). Only
 * STRUCTURE is cloned, gated by `clone`; content is always empty on a new
 * edition (see `buildEditionDocuments`).
 */
export const CreateEditionSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required'),
    organizer: z.string().trim().min(1).nullable().optional(),
    startDate: dateString,
    endDate: dateString,
    cfpStartDate: optionalDateString,
    cfpEndDate: optionalDateString,
    cfpNotifyDate: optionalDateString,
    programDate: optionalDateString,
    domains: NewEditionDomains,
    clone: CloneFlagsSchema,
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  })
  .refine(
    (d) => !d.cfpStartDate || !d.cfpEndDate || d.cfpEndDate >= d.cfpStartDate,
    {
      message: 'CFP end date must be on or after the CFP start date',
      path: ['cfpEndDate'],
    },
  )

// === Homepage Composition (front-page builder F1/F2) =====================

/**
 * The homepage section list — a full-array replace mirroring the CLOSED registry
 * in `src/lib/homepage/sections.ts`. A STRICT discriminated union on `_type`:
 * unknown block types are rejected at the boundary (the renderer additionally
 * skips unknown types it reads back, for forward compat). Every block carries an
 * optional `_key` (the router re-keys) and a `hidden` visibility flag (F1).
 *
 * An empty array UNSETS the field — the page falls back to the phase-aware
 * default layout. Content still comes from the existing conference sources;
 * blocks carry only their own presentation config.
 */
const sectionKey = z.string().optional()
const sectionHidden = z.boolean().optional()

/**
 * Optional per-section COPY (heading/sub-heading/CTA text). Blank is rejected
 * rather than stored: an absent field is what makes a section fall back to the
 * house default, so an empty string would be a third, meaningless state. The
 * editor omits blanks before it builds the payload.
 */
const sectionCopy = z.string().trim().min(1).nullable().optional()

/**
 * A link an ORGANIZER can point a public-page button at: a site-internal path
 * (`/tickets`) or an absolute http(s) URL. Anything else — `javascript:`,
 * `data:`, scheme-relative `//host` — is rejected: these are tenant-entered
 * values rendered into every visitor's page, so the scheme surface must be
 * closed at the write path (same standard as the legal-page authority URL).
 */
const safeLinkHref = z
  .string()
  .trim()
  .min(1, 'Link is required')
  .refine(
    (value) => {
      if (value.startsWith('/') && !value.startsWith('//')) return true
      // Require the EXPLICIT scheme prefix: `new URL` also parses degenerate
      // forms like `https:example.com` (no authority), which are not the
      // "full http(s) URL" the message promises.
      if (!/^https?:\/\//i.test(value)) return false
      try {
        const parsed = new URL(value)
        return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      } catch {
        return false
      }
    },
    {
      message: 'Enter a site path (e.g. /tickets) or a full http(s) URL',
    },
  )

const HeroCtaOverrideSchema = z.object({
  _key: sectionKey,
  label: z.string().trim().min(1, 'Label is required'),
  href: safeLinkHref,
})

/**
 * A tenant-entered date for the countdown target. Accepts a bare `YYYY-MM-DD`
 * (anchored at 12:00 UTC (the house date-anchoring convention) downstream) or any timestamp `Date.parse` understands
 * (e.g. the datetime-local editor value); anything unparseable is rejected so
 * the stored value always resolves.
 */
const countdownTargetString = z
  .string()
  .trim()
  .min(1)
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'Enter a valid date',
  })
  .nullable()
  .optional()

const HomepageFaqItemSchema = z.object({
  _key: sectionKey,
  question: z.string().trim().min(1, 'Question is required'),
  answer: z.string().trim().min(1, 'Answer is required'),
})

const HomepageSectionSchema = z.discriminatedUnion('_type', [
  z.object({
    _type: z.literal('homepageHero'),
    _key: sectionKey,
    hidden: sectionHidden,
    heroHeadline: z.string().trim().min(1).nullable().optional(),
    heroSubheadline: z.string().trim().min(1).nullable().optional(),
    ctaOverrides: z.array(HeroCtaOverrideSchema).optional(),
  }),
  z.object({
    _type: z.literal('homepageFeaturedSpeakers'),
    _key: sectionKey,
    hidden: sectionHidden,
    heading: sectionCopy,
    description: sectionCopy,
  }),
  z.object({
    _type: z.literal('homepageProgramHighlights'),
    _key: sectionKey,
    hidden: sectionHidden,
  }),
  z.object({
    _type: z.literal('homepageOrganizers'),
    _key: sectionKey,
    hidden: sectionHidden,
    heading: sectionCopy,
    description: sectionCopy,
  }),
  z.object({
    _type: z.literal('homepageSponsors'),
    _key: sectionKey,
    hidden: sectionHidden,
    heading: sectionCopy,
    description: sectionCopy,
    // Absent = the CTA card shows (today's behaviour); only `false` hides it.
    showCta: z.boolean().optional(),
    ctaHeading: sectionCopy,
    ctaDescription: sectionCopy,
  }),
  z.object({
    _type: z.literal('homepageGallery'),
    _key: sectionKey,
    hidden: sectionHidden,
    heading: sectionCopy,
    description: sectionCopy,
  }),
  z.object({
    _type: z.literal('homepageMetrics'),
    _key: sectionKey,
    hidden: sectionHidden,
    heading: z.string().trim().min(1).nullable().optional(),
  }),
  z.object({
    _type: z.literal('homepageCtaBanner'),
    _key: sectionKey,
    hidden: sectionHidden,
    heading: z.string().trim().min(1, 'Heading is required'),
    body: z.string().trim().min(1).nullable().optional(),
    buttonLabel: z.string().trim().min(1, 'Button label is required'),
    buttonHref: safeLinkHref,
  }),
  z.object({
    _type: z.literal('homepageRichText'),
    _key: sectionKey,
    hidden: sectionHidden,
    heading: z.string().trim().min(1).nullable().optional(),
    content: z
      .array(PortableTextBlockSchema)
      .min(1, 'Rich text needs at least one block'),
  }),
  z.object({
    _type: z.literal('homepageFaq'),
    _key: sectionKey,
    hidden: sectionHidden,
    heading: z.string().trim().min(1).nullable().optional(),
    // 'own' (default) renders `items`; 'ticketFaqs' renders conference.ticketFaqs.
    source: z.enum(['own', 'ticketFaqs']).optional(),
    items: z.array(HomepageFaqItemSchema).optional(),
  }),
  z.object({
    _type: z.literal('homepageCountdown'),
    _key: sectionKey,
    hidden: sectionHidden,
    heading: z.string().trim().min(1).nullable().optional(),
    targetOverride: countdownTargetString,
    liveMessage: z.string().trim().min(1).nullable().optional(),
  }),
  z.object({
    _type: z.literal('homepageVenue'),
    _key: sectionKey,
    hidden: sectionHidden,
    heading: z.string().trim().min(1).nullable().optional(),
    description: z.string().trim().min(1).nullable().optional(),
  }),
])

export const UpdateHomepageSectionsSchema = z.object({
  homepageSections: z.array(HomepageSectionSchema),
})
