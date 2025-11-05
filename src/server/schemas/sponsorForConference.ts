import { z } from 'zod'

export const SponsorStatusSchema = z.enum([
  'prospect',
  'contacted',
  'negotiating',
  'closed-won',
  'closed-lost',
])

export const InvoiceStatusSchema = z.enum([
  'not-sent',
  'sent',
  'paid',
  'overdue',
  'cancelled',
])

export const ContractStatusSchema = z.enum([
  'none',
  'verbal-agreement',
  'contract-sent',
  'contract-signed',
])

export const SponsorTagSchema = z.enum([
  'warm-lead',
  'returning-sponsor',
  'cold-outreach',
  'referral',
  'high-priority',
  'needs-follow-up',
  'multi-year-potential',
])

export const CurrencySchema = z.enum(['NOK', 'USD', 'EUR', 'GBP'])

export const SponsorForConferenceInputSchema = z.object({
  sponsor: z.string().min(1, 'Sponsor ID is required'),
  conference: z.string().min(1, 'Conference ID is required'),
  tier: z.string().optional(),
  contract_status: ContractStatusSchema,
  status: SponsorStatusSchema,
  assigned_to: z.string().optional(),
  contact_initiated_at: z.string().optional(),
  contract_signed_at: z.string().optional(),
  contract_value: z.number().min(0).optional(),
  contract_currency: CurrencySchema.optional(),
  invoice_status: InvoiceStatusSchema,
  invoice_sent_at: z.string().optional(),
  invoice_paid_at: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(SponsorTagSchema).optional(),
})

export const SponsorForConferenceUpdateSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  tier: z.string().optional(),
  contract_status: ContractStatusSchema.optional(),
  status: SponsorStatusSchema.optional(),
  assigned_to: z.string().nullable().optional(),
  contact_initiated_at: z.string().nullable().optional(),
  contract_signed_at: z.string().nullable().optional(),
  contract_value: z.number().min(0).nullable().optional(),
  contract_currency: CurrencySchema.optional(),
  invoice_status: InvoiceStatusSchema.optional(),
  invoice_sent_at: z.string().nullable().optional(),
  invoice_paid_at: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(SponsorTagSchema).optional(),
})

export const SponsorForConferenceIdSchema = z.object({
  id: z.string().min(1, 'ID is required'),
})

export const MoveStageSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  newStatus: SponsorStatusSchema,
})

export const UpdateInvoiceStatusSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  newStatus: InvoiceStatusSchema,
})

export const CopySponsorsSchema = z.object({
  sourceConferenceId: z.string().min(1, 'Source conference ID is required'),
  targetConferenceId: z.string().min(1, 'Target conference ID is required'),
})
