import { z } from 'zod'

const nullToUndefined = <T>(val: T | null): T | undefined =>
  val === null ? undefined : val

export const ContactPersonSchema = z.object({
  _key: z.string(),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().nullable().optional().transform(nullToUndefined),
  role: z.string().nullable().optional().transform(nullToUndefined),
})

export const BillingInfoSchema = z.object({
  email: z.string().email('Valid billing email is required'),
  reference: z.string().nullable().optional().transform(nullToUndefined),
  comments: z.string().nullable().optional().transform(nullToUndefined),
})

export const SponsorInputSchema = z.object({
  name: z.string().min(1, 'Sponsor name is required'),
  website: z.string().url('Valid website URL is required'),
  logo: z.string().min(1, 'Logo is required'),
  logo_bright: z.string().nullable().optional().transform(nullToUndefined),
  org_number: z.string().nullable().optional().transform(nullToUndefined),
  contact_persons: z.array(ContactPersonSchema).optional(),
  billing: BillingInfoSchema.optional(),
  tierId: z.string().nullable().optional().transform(nullToUndefined),
})

export const SponsorTierPriceSchema = z.object({
  _key: z.string().nullable().optional().transform(nullToUndefined),
  amount: z.number().min(0, 'Amount must be positive'),
  currency: z.string().min(1, 'Currency is required'),
})

export const SponsorTierPerkSchema = z.object({
  _key: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  label: z.string().min(1, 'Perk label is required'),
  description: z.string().min(1, 'Perk description is required'),
})

export const SponsorTierInputSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  tagline: z.string().min(1, 'Tagline is required'),
  tier_type: z.enum(['standard', 'special']),
  price: z.array(SponsorTierPriceSchema).optional(),
  perks: z.array(SponsorTierPerkSchema).optional(),
  sold_out: z.boolean(),
  most_popular: z.boolean(),
})

export const ConferenceSponsorInputSchema = z.object({
  sponsorId: z.string().min(1, 'Sponsor ID is required'),
  tierId: z.string().min(1, 'Tier ID is required'),
})

export const SponsorTierAssignmentSchema = z.object({
  sponsorName: z.string().min(1, 'Sponsor name is required'),
  tierId: z.string().min(1, 'Tier ID is required'),
})

export const SponsorSearchSchema = z.object({
  query: z.string().optional(),
  includeContactInfo: z.boolean().default(false),
})

export const SponsorUpdateSchema = SponsorInputSchema.partial()
export const SponsorTierUpdateSchema = SponsorTierInputSchema.partial()

export const IdParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
})
