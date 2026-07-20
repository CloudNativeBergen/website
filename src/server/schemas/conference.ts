import { z } from 'zod'
import { HEROICON_OPTIONS } from '../../../sanity/schemaTypes/constants'
import { isValidDomainEntry, normalizeDomain } from '@/lib/conference/domains'

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

// === Venue ===
export const UpdateVenueSchema = z.object({
  venueName: z.string().trim().nullable().optional(),
  venueAddress: z.string().trim().nullable().optional(),
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
export const UpdateTicketingIdsSchema = z.object({
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

// === Features (array of string flags) ===
// See EditConferenceCard for the "known + freeform" UI. The Sanity schema
// declares a single known value (`test_feature`) and there are NO runtime
// consumers, so the server stays permissive: any non-empty flag string, unique,
// empty list allowed.
export const UpdateFeaturesSchema = z.object({
  features: z
    .array(z.string().trim().min(1, 'Feature flag cannot be empty'))
    .refine((f) => new Set(f).size === f.length, {
      message: 'Feature flags must be unique',
    }),
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
