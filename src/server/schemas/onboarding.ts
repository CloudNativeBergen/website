import { z } from 'zod'

export const OnboardingTokenSchema = z.object({
  token: z.string().uuid(),
})

export const OnboardingContactPersonSchema = z.object({
  _key: z.string().default(''),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  role: z.string().optional(),
  isPrimary: z.boolean().optional(),
})

export const OnboardingBillingSchema = z.object({
  email: z.string().email('Valid billing email is required'),
  reference: z.string().optional(),
  comments: z.string().optional(),
})

export const OnboardingSubmissionSchema = z.object({
  token: z.string().uuid(),
  contactPersons: z
    .array(OnboardingContactPersonSchema)
    .min(1, 'At least one contact person is required'),
  billing: OnboardingBillingSchema,
  logo: z.string().nullable().optional(),
  logoBright: z.string().nullable().optional(),
  orgNumber: z.string().optional(),
  address: z.string().optional(),
  signerEmail: z.string().email().optional(),
})

export const GenerateOnboardingTokenSchema = z.object({
  sponsorForConferenceId: z.string().min(1),
})
