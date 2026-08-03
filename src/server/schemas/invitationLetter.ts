import { z } from 'zod'

export const ParticipantRoleSchema = z.enum([
  'attendee',
  'speaker',
  'sponsor',
  'organizer',
])

/** `YYYY-MM-DD`, the form the date inputs submit. */
const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD form')

/**
 * The organizer's input for one letter.
 *
 * Every applicant field here is **transient**: the resolver renders it into the
 * PDF and lets it go. Nothing in this schema is written to Sanity — see
 * `recordInvitationLetter`, which cannot even accept these fields.
 */
export const IssueInvitationLetterSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Full name as written in the passport'),
    dateOfBirth: DateOnlySchema,
    nationality: z.string().trim().min(1, 'Nationality is required'),
    passportNumber: z.string().trim().min(1, 'Passport number is required'),
    passportExpiry: DateOnlySchema.optional(),
    email: z.string().email('Enter a valid email address').optional(),
    organization: z.string().trim().max(200).optional(),
    role: ParticipantRoleSchema,
    registrationReference: z.string().trim().max(120).optional(),
    arrivalDate: DateOnlySchema.optional(),
    departureDate: DateOnlySchema.optional(),
    addressedTo: z.string().trim().max(200).optional(),
    costCoverage: z.object({
      registrationFee: z.boolean(),
      travel: z.boolean(),
      accommodation: z.boolean(),
    }),
    additionalNotes: z.string().trim().max(1000).optional(),
    /** Handwritten counter-signature, captured client-side like contracts. */
    signatureDataUrl: z
      .string()
      .startsWith('data:image/', 'Expected an image data URL')
      .max(500_000)
      .optional(),
    signatoryTitle: z.string().trim().max(120).optional(),
    delivery: z.enum(['download', 'email', 'both']).default('download'),
  })
  .refine(
    (input) =>
      !input.arrivalDate ||
      !input.departureDate ||
      input.arrivalDate <= input.departureDate,
    {
      message: 'Departure cannot be before arrival',
      path: ['departureDate'],
    },
  )
  .refine((input) => input.delivery === 'download' || !!input.email, {
    message: 'An email address is required to send the letter',
    path: ['email'],
  })
