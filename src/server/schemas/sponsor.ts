import { z } from 'zod'

const nullToUndefined = <T>(val: T | null): T | undefined =>
  val === null ? undefined : val

export const ContactPersonSchema = z.object({
  _key: z.string(),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().nullable().optional().transform(nullToUndefined),
  role: z.string().nullable().optional().transform(nullToUndefined),
  linkedinUrl: z
    .string()
    .url()
    .nullable()
    .optional()
    .transform(nullToUndefined),
})

export const InvoiceFormatSchema = z.enum(['ehf', 'pdf'])

export const BillingInfoSchema = z.object({
  invoiceFormat: InvoiceFormatSchema.default('pdf'),
  email: z.string().email('Valid billing email is required'),
  reference: z.string().nullable().optional().transform(nullToUndefined),
  comments: z.string().nullable().optional().transform(nullToUndefined),
})

/**
 * Billing as EDITED by an organizer, where every field is independently
 * fillable and none may be guessed.
 *
 * {@link BillingInfoSchema} models a COMPLETE billing record (email required,
 * format defaulted to `pdf`) — correct for the sponsor-facing registration
 * flow, which collects both in one go. It is the wrong shape for a CRM patch:
 * requiring the email there meant an organizer who changed only the invoice
 * format (or the reference/comments) on a sponsor with no billing email had
 * the whole object dropped by the caller and the edit silently discarded, and
 * defaulting the format would record a choice nobody made — the exact guess
 * `invoiceFormatLabel` refuses to make (see `src/lib/sponsor-crm/billing.ts`).
 *
 * So: no default, no required field. `evaluateBilling` reports whatever is
 * still missing as a gap, which is how partial billing is meant to surface.
 */
export const BillingInfoPatchSchema = z.object({
  invoiceFormat: InvoiceFormatSchema.nullable()
    .optional()
    .transform(nullToUndefined),
  email: z
    .union([z.string().email('Valid billing email is required'), z.literal('')])
    .nullable()
    .optional()
    .transform((val) => (val ? val : undefined)),
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
  linkedinUrl: z
    .string()
    .url()
    .nullable()
    .optional()
    .transform(nullToUndefined),
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
  /**
   * Complimentary tickets per sponsor in this tier. `null`/absent means none.
   * Replaces the hardcoded `SPONSOR_TIER_TICKET_ALLOCATION` title map.
   */
  ticketEntitlement: z.number().int().min(0).nullable().optional(),
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
  'contract',
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

export const SponsorIdSchema = z.object({
  id: z.string().min(1),
})
