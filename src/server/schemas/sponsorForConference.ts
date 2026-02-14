import { z } from 'zod'
import { ContactPersonSchema, BillingInfoSchema } from './sponsor'

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

export const SignatureStatusSchema = z.enum([
  'not-started',
  'pending',
  'signed',
  'rejected',
  'expired',
])

export const SponsorTagSchema = z.enum([
  'warm-lead',
  'returning-sponsor',
  'cold-outreach',
  'referral',
  'high-priority',
  'needs-follow-up',
  'multi-year-potential',
  'previously-declined',
])

export const CurrencySchema = z.enum(['NOK', 'USD', 'EUR', 'GBP'])

export const SponsorForConferenceInputSchema = z.object({
  sponsor: z.string().min(1, 'Sponsor ID is required'),
  conference: z.string().min(1, 'Conference ID is required'),
  tier: z.string().optional(),
  addons: z
    .array(z.string().min(1, 'Addon ID cannot be empty'))
    .optional()
    .refine(
      (addons) => {
        if (!addons || addons.length === 0) return true
        const unique = new Set(addons)
        return unique.size === addons.length
      },
      { message: 'Addon IDs must be unique' },
    ),
  contractStatus: ContractStatusSchema,
  signatureStatus: SignatureStatusSchema.optional(),
  signerEmail: z.string().email().optional(),
  signingUrl: z.string().url().optional(),
  contractTemplate: z.string().optional(),
  status: SponsorStatusSchema,
  assignedTo: z.string().nullable().optional(),
  contactInitiatedAt: z.string().optional(),
  contractSignedAt: z.string().optional(),
  contractValue: z.number().min(0).optional(),
  contractCurrency: CurrencySchema.optional(),
  invoiceStatus: InvoiceStatusSchema,
  invoiceSentAt: z.string().optional(),
  invoicePaidAt: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(SponsorTagSchema).optional(),
  contactPersons: z
    .array(
      ContactPersonSchema.extend({
        isPrimary: z.boolean().optional(),
      }),
    )
    .optional()
    .refine((arr) => !arr || arr.filter((c) => c.isPrimary).length <= 1, {
      message: 'Only one contact can be marked as primary',
    }),
  billing: BillingInfoSchema.optional(),
})

export const SponsorForConferenceUpdateSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  tier: z.string().optional(),
  addons: z
    .array(z.string().min(1, 'Addon ID cannot be empty'))
    .optional()
    .refine(
      (addons) => {
        if (!addons || addons.length === 0) return true
        const unique = new Set(addons)
        return unique.size === addons.length
      },
      { message: 'Addon IDs must be unique' },
    ),
  contractStatus: ContractStatusSchema.optional(),
  signatureStatus: SignatureStatusSchema.optional(),
  signerEmail: z.string().email().nullable().optional(),
  signingUrl: z.string().url().nullable().optional(),
  contractTemplate: z.string().nullable().optional(),
  status: SponsorStatusSchema.optional(),
  assignedTo: z.string().nullable().optional(),
  contactInitiatedAt: z.string().nullable().optional(),
  contractSignedAt: z.string().nullable().optional(),
  contractValue: z.number().min(0).nullable().optional(),
  contractCurrency: CurrencySchema.optional(),
  invoiceStatus: InvoiceStatusSchema.optional(),
  invoiceSentAt: z.string().nullable().optional(),
  invoicePaidAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(SponsorTagSchema).optional(),
  contactPersons: z
    .array(
      ContactPersonSchema.extend({
        isPrimary: z.boolean().optional(),
      }),
    )
    .optional()
    .refine((arr) => !arr || arr.filter((c) => c.isPrimary).length <= 1, {
      message: 'Only one contact can be marked as primary',
    }),
  billing: BillingInfoSchema.nullable().optional(),
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

export const UpdateContractStatusSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  newStatus: ContractStatusSchema,
})

export const UpdateSignatureStatusSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  newStatus: SignatureStatusSchema,
})

export const CopySponsorsSchema = z.object({
  sourceConferenceId: z.string().min(1, 'Source conference ID is required'),
  targetConferenceId: z.string().min(1, 'Target conference ID is required'),
})

export const BulkUpdateSponsorCRMSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1, 'At least one sponsor must be selected'),
  status: SponsorStatusSchema.optional(),
  contractStatus: ContractStatusSchema.optional(),
  invoiceStatus: InvoiceStatusSchema.optional(),
  assignedTo: z.string().nullable().optional(),
  tags: z.array(SponsorTagSchema).optional(),
  addTags: z.array(SponsorTagSchema).optional(),
  removeTags: z.array(SponsorTagSchema).optional(),
})

export const BulkDeleteSponsorCRMSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1, 'At least one sponsor must be selected'),
})

export const ImportAllHistoricSponsorsSchema = z.object({
  targetConferenceId: z.string().min(1, 'Target conference ID is required'),
})
