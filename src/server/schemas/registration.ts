import { z } from 'zod'

import { InvoiceFormatSchema } from './sponsor'

export const RegistrationTokenSchema = z.object({
  token: z.string().uuid(),
})

export const RegistrationContactPersonSchema = z.object({
  _key: z.string().default(''),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  role: z.string().optional(),
  isPrimary: z.boolean().optional(),
})

export const RegistrationBillingSchema = z.object({
  invoiceFormat: InvoiceFormatSchema.default('pdf'),
  email: z.string().email('Valid billing email is required'),
  reference: z.string().optional(),
  comments: z.string().optional(),
})

export const RegistrationSubmissionSchema = z.object({
  token: z.string().uuid(),
  contactPersons: z
    .array(RegistrationContactPersonSchema)
    .min(1, 'At least one contact person is required'),
  billing: RegistrationBillingSchema,
  logo: z.string().min(1, 'Company logo is required'),
  logoBright: z.string().nullable().optional(),
  orgNumber: z.string().optional(),
  address: z.string().optional(),
  signerName: z.string().optional(),
  signerEmail: z.string().email().optional(),
})

export const GenerateRegistrationTokenSchema = z.object({
  sponsorForConferenceId: z.string().min(1),
})
