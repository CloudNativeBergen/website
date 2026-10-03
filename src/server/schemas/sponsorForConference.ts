import { z } from 'zod'
import {
  ContactPersonSchema,
  BillingInfoSchema,
  BillingInfoPatchSchema,
} from './sponsor'

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
  'registration-sent',
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
  signerName: z.string().optional(),
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
  nextFollowUpAt: z.string().optional(),
  outreachCount: z.number().min(0).optional(),
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
  signerName: z.string().nullable().optional(),
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
  // A CRM edit patches billing field by field (see BillingInfoPatchSchema):
  // `null` clears the whole object, an object writes exactly what was filled
  // in, and `undefined` leaves it alone.
  billing: BillingInfoPatchSchema.nullable().optional(),
  nextFollowUpAt: z.string().nullable().optional(),
  outreachCount: z.number().min(0).nullable().optional(),
})

export const SponsorForConferenceIdSchema = z.object({
  id: z.string().min(1, 'ID is required'),
})

export const DeleteSponsorSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  cancelAgreement: z.boolean().optional(),
  deleteContractAsset: z.boolean().optional(),
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
  cancelAgreements: z.boolean().optional(),
  deleteContractAssets: z.boolean().optional(),
})

export const ImportAllHistoricSponsorsSchema = z.object({
  targetConferenceId: z.string().min(1, 'Target conference ID is required'),
})

/**
 * One sponsor email, through the one primitive (#1261). Recipients are contact
 * KEYS — the server resolves addresses from the sponsor's own contacts and
 * refuses anything else — and the body is PortableText JSON as the editor
 * produces it. Slice 1 accepted `information`; #1262 added `discount`, #1263
 * `registration`, #1264 `contract`.
 */
export const CommunicationKindSchema = z.enum([
  'information',
  'contract',
  'registration',
  'discount',
])

export const SendCommunicationSchema = z
  .object({
    sponsorForConferenceId: z.string().min(1, 'Sponsor ID is required'),
    kind: z.enum(['information', 'discount', 'registration', 'contract']),
    /**
     * At least one — except for a contract reminder or signed copy, which
     * the server addresses to the signer on record even with no contact
     * ticked (they may no longer be a contact at all).
     */
    recipientKeys: z.array(z.string().min(1)).max(20),
    subject: z.string().trim().min(1, 'Subject is required').max(200),
    /** PortableText blocks, JSON-encoded (same wire shape as the old sendEmail). */
    message: z.string().min(1).max(100_000),
    /**
     * The template the draft started from. `edited` is accepted for wire
     * compatibility but IGNORED: the server computes it by re-merging the
     * template and comparing with what is sent.
     */
    template: z
      .object({ id: z.string().min(1), edited: z.boolean().optional() })
      .optional(),
    /**
     * Discount kind only (#1262): the codes to send, as the provider spells
     * them. Checked on the server against the conference's own event.
     */
    discountCodes: z
      .array(z.string().trim().min(1).max(100))
      .max(20)
      .optional(),
    /**
     * Contract kind only (#1264), first send: which recipient signs (a key
     * among `recipientKeys`), which contract template renders the PDF
     * (tenancy-guarded on the server; the best template for the tier when
     * absent), and the assigned organizer's counter-signature.
     */
    signerKey: z.string().min(1).optional(),
    /**
     * The action the composer was opened for (label, template, preview). The
     * server decides the real action from the current state and REFUSES a
     * stale composer rather than performing a different action with its text.
     */
    contractAction: z.enum(['send', 'remind', 'signed-copy']).optional(),
    contractTemplateId: z.string().min(1).optional(),
    organizerSignatureDataUrl: z
      .string()
      .max(500_000, 'Organizer signature image is too large')
      .startsWith(
        'data:image/png;base64,',
        'Organizer signature must be a PNG data URL',
      )
      .optional(),
  })
  .superRefine((input, ctx) => {
    const contractFields = [
      'signerKey',
      'contractAction',
      'contractTemplateId',
      'organizerSignatureDataUrl',
    ] as const
    if (input.kind !== 'contract') {
      for (const field of contractFields) {
        if (input[field] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: 'Only a contract send carries this field',
          })
        }
      }
    }
    if (input.kind === 'contract' && !input.contractAction) {
      ctx.addIssue({
        code: 'custom',
        path: ['contractAction'],
        message: 'A contract send names the action it was composed for',
      })
    }
    if (input.kind !== 'contract' && input.recipientKeys.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['recipientKeys'],
        message: 'Choose at least one recipient',
      })
    }
    if (input.signerKey && !input.recipientKeys.includes(input.signerKey)) {
      ctx.addIssue({
        code: 'custom',
        path: ['signerKey'],
        message: 'The signer must be one of the chosen recipients',
      })
    }
    const codes = input.discountCodes ?? []
    if (input.kind === 'discount' && codes.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountCodes'],
        message: 'Choose at least one discount code',
      })
    }
    if (input.kind !== 'discount' && codes.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountCodes'],
        message: 'Only a discount send carries codes',
      })
    }
  })

/** The Send modal's discount-code picker for one sponsor (#1262). */
export const SponsorDiscountCodeOptionsSchema = z.object({
  sponsorForConferenceId: z.string().min(1, 'Sponsor ID is required'),
})

/** Discount code manager → Assign to sponsor (#1262): link without sending. */
export const AssignDiscountCodesSchema = z.object({
  sponsorForConferenceId: z.string().min(1, 'Sponsor ID is required'),
  discountCodes: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
})

export const CommunicationRecordIdSchema = z.object({
  id: z.string().min(1, 'Activity ID is required'),
})

export const ListCommunicationsSchema = z.object({
  sponsorForConferenceId: z.string().min(1, 'Sponsor ID is required'),
  kind: CommunicationKindSchema.optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

export const CreateSponsorActivitySchema = z.object({
  sponsorForConferenceId: z.string().min(1, 'Sponsor ID is required'),
  activityType: z.enum(['note', 'call', 'meeting', 'email']),
  description: z.string().min(1, 'Description is required'),
})

/**
 * Edit of a user-authored activity (SE-4). Only `note`/`call`/`meeting`/`email`
 * activities are editable, and only by their creator — the server re-checks
 * both against the stored doc (mirroring the delete gating). The `activityType`
 * is NOT editable here.
 */
export const UpdateSponsorActivitySchema = z.object({
  id: z.string().min(1, 'Activity ID is required'),
  description: z.string().min(1, 'Description is required'),
  metadata: z
    .object({
      oldValue: z.string().optional(),
      newValue: z.string().optional(),
      timestamp: z.string().optional(),
      additionalData: z.string().optional(),
    })
    .optional(),
})

export const SponsorCRMFilterSchema = z.object({
  status: z.array(z.string()).optional(),
  invoiceStatus: z.array(z.string()).optional(),
  assignedTo: z.string().optional(),
  // TEAMS-3 (L3): filter to a TEAM — assignee is any of the team's member ids.
  // The client resolves the selected team key to its member set and sends it
  // here; empty/absent means no team filter. Mutually exclusive with
  // assignedTo/unassignedOnly on the client (team clears them and vice versa).
  assignedToIds: z.array(z.string()).optional(),
  myAssignedOnly: z.boolean().optional(),
  unassignedOnly: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  tiers: z.array(z.string()).optional(),
  searchQuery: z.string().optional(),
  view: z
    .enum(['pipeline', 'invoice', 'contract'])
    .optional()
    .default('pipeline'),
  sortBy: z
    .enum(['lastActivity', 'value', 'stale', 'name', 'createdAt', 'followUp'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  staleDays: z.number().optional(),
  hasContactInfo: z.boolean().optional(),
  followUpDue: z.boolean().optional(),
  hasFollowUp: z.boolean().optional(),
  /**
   * Filter on whether the sponsor can actually be invoiced as recorded — see
   * `evaluateBilling`. `true` keeps only complete records, `false` keeps only
   * those with at least one gap. Evaluated in the resolver rather than GROQ
   * because the rules span the sponsor document (org. number for EHF).
   */
  billingComplete: z.boolean().optional(),
  /**
   * Filter on whether an invoice can be raised as recorded — see
   * `evaluateInvoiceReadiness`. Stricter than `billingComplete`: it also
   * requires an amount and a signed contract.
   */
  invoiceReady: z.boolean().optional(),
})
