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
  logo: z.string().nullable().optional().or(z.literal('')),
  logoBright: z.string().nullable().optional(),
  orgNumber: z.string().nullable().optional().transform(nullToUndefined),
  address: z.string().nullable().optional().transform(nullToUndefined),
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
  tierType: z.enum(['standard', 'special', 'addon']),
  price: z.array(SponsorTierPriceSchema).optional(),
  perks: z.array(SponsorTierPerkSchema).optional(),
  soldOut: z.boolean(),
  mostPopular: z.boolean(),
  maxQuantity: z.number().min(1).nullable().optional(),
})

export const SponsorUpdateSchema = SponsorInputSchema.partial()
export const SponsorTierUpdateSchema = SponsorTierInputSchema.partial()

export const IdParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
})

export const TemplateCategorySchema = z.enum([
  'cold-outreach',
  'returning-sponsor',
  'international',
  'local-community',
  'follow-up',
  'custom',
])

export const TemplateLanguageSchema = z.enum(['no', 'en'])

export const SponsorEmailTemplateInputSchema = z.object({
  title: z.string().min(1, 'Template name is required'),
  slug: z.string().min(1, 'Slug is required'),
  category: TemplateCategorySchema,
  language: TemplateLanguageSchema,
  subject: z.string().min(1, 'Subject is required'),
  body: z.array(z.record(z.string(), z.unknown())).optional(),
  description: z.string().nullable().optional().transform(nullToUndefined),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().optional(),
})

export const SponsorEmailTemplateUpdateSchema =
  SponsorEmailTemplateInputSchema.partial()

export const ReorderTemplatesSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
})

export const SetDefaultTemplateSchema = z.object({
  id: z.string().min(1),
})
