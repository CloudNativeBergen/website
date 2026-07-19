import { z } from 'zod'

/**
 * Field-scoped conference settings schemas (SE-1a). Each schema mirrors ONE
 * fieldset group of scalar fields from `sanity/schemaTypes/conference.ts` and is
 * consumed by exactly one mutation in `src/server/routers/conference.ts`. Only
 * scalar field groups are covered here; arrays/objects (social links, domains,
 * features, vanity metrics, sponsor benefits, teams, organizers, topics,
 * announcement, logos) are LATER phases and deliberately excluded.
 *
 * UNSET SEMANTICS (shared across every schema): a field left `undefined` is
 * untouched; an explicit `null` unsets the (optional) field. The router's patch
 * builder translates these to Sanity `.set()` / `.unset()` respectively — see
 * `applyConferencePatch`.
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
