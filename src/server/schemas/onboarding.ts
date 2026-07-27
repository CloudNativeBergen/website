import { z } from 'zod'
import { isValidDomainEntry, normalizeDomain } from '@/lib/conference/domains'
import { ORG_SLUG_RE } from '@/lib/onboarding/create'

/**
 * Onboarding S1 — input schemas for the platform-operator concierge flow
 * (`src/server/routers/onboarding.ts`). Mirrors the SE-5 `CreateEditionSchema`
 * conventions; the ONE deliberate divergence is that `domains` may be EMPTY —
 * a new tenant can start on no domain and attach one later from settings.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const dateString = z
  .string()
  .regex(DATE_RE, 'Date must be in YYYY-MM-DD format')
const optionalDateString = dateString.nullable().optional()

const emailString = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')

/** Kebab-case org slug, matching the organization schema's slugify output. */
const orgSlug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Slug is required')
  .max(96, 'Slug must be at most 96 characters')
  .regex(
    ORG_SLUG_RE,
    'Use lowercase letters, digits and single dashes (no leading/trailing dash)',
  )

/**
 * OPTIONAL domain list (may be empty, unlike `NewEditionDomains`): entries are
 * normalized, must be valid bare hostnames and unique within the payload.
 * GLOBAL uniqueness (claimed by another conference) is enforced in the router.
 */
const OptionalDomains = z
  .array(z.string())
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
          message: 'Enter a bare hostname, e.g. conference.example.com',
          path: [i],
        })
        return
      }
      if (seen.has(entry)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate domain',
          path: [i],
        })
        return
      }
      seen.add(entry)
    })
  })

export const CreateOrganizationSchema = z
  .object({
    organization: z.object({
      name: z.string().trim().min(1, 'Organization name is required'),
      slug: orgSlug,
      contactEmail: emailString,
      billingEmail: emailString.nullable().optional(),
    }),
    conference: z.object({
      title: z.string().trim().min(1, 'Conference title is required'),
      city: z.string().trim().min(1, 'City is required'),
      country: z.string().trim().min(1, 'Country is required'),
      startDate: optionalDateString,
      endDate: optionalDateString,
    }),
    organizer: z.object({
      name: z.string().trim().min(1, 'Organizer name is required'),
      email: emailString,
    }),
    domains: OptionalDomains,
  })
  .refine(
    (d) =>
      !d.conference.startDate ||
      !d.conference.endDate ||
      d.conference.endDate >= d.conference.startDate,
    {
      message: 'End date must be on or after the start date',
      path: ['conference', 'endDate'],
    },
  )
  // Dates travel as a pair: one without the other is almost certainly a slip
  // (a single-day event should set both to the same date).
  .refine(
    (d) => Boolean(d.conference.startDate) === Boolean(d.conference.endDate),
    {
      message: 'Provide both start and end dates, or neither',
      path: ['conference', 'endDate'],
    },
  )

/** Preflight probe for the wizard's inline availability feedback. */
export const ValidateOnboardingSchema = z.object({
  slug: orgSlug.optional(),
  domains: OptionalDomains.optional(),
  organizerEmail: emailString.optional(),
})
