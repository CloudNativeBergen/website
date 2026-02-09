import { z } from 'zod'
import {
  Language,
  Level,
  Audience,
  Format,
  Action,
  isWorkshopFormat,
} from '@/lib/proposal/types'
import {
  nullToUndefined,
  IdParamSchema as CommonIdParamSchema,
  ReferenceSchema,
} from './common'

// Portable text block schema - validate as array of any with non-empty check
const PortableTextBlockSchema = z
  .array(z.any())
  .refine((arr) => arr.length > 0, {
    message: 'Description cannot be empty',
  })

// Base proposal schema without refinements (for extending)
const ProposalInputBaseSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: PortableTextBlockSchema,
  language: z.nativeEnum(Language, {
    message: 'Language must be specified',
  }),
  format: z.nativeEnum(Format, {
    message: 'Format must be specified',
  }),
  level: z.nativeEnum(Level, {
    message: 'Level must be specified',
  }),
  audiences: z
    .array(z.nativeEnum(Audience))
    .min(1, 'At least one audience must be specified'),
  outline: z.string().nullable().optional().transform(nullToUndefined),
  topics: z.array(ReferenceSchema).min(1, 'At least one topic is required'),
  tos: z.boolean().refine((val) => val === true, {
    message: 'Terms of Service must be accepted',
  }),
  video: z.string().nullable().optional().transform(nullToUndefined),
  capacity: z.number().nullable().optional().transform(nullToUndefined),
  speakers: z
    .array(ReferenceSchema)
    .nullable()
    .optional()
    .transform(nullToUndefined),
})

// Proposal input schema (for create/update)
export const ProposalInputSchema = ProposalInputBaseSchema.refine(
  (data) => {
    // Workshop formats require capacity
    if (isWorkshopFormat(data.format) && !data.capacity) {
      return false
    }
    return true
  },
  {
    message: 'Workshop capacity is required for workshop formats',
    path: ['capacity'],
  },
)

// Admin-specific proposal creation (includes speaker IDs)
export const ProposalAdminCreateSchema = ProposalInputBaseSchema.extend({
  speakers: z.array(z.string()).min(1, 'At least one speaker is required'),
  conferenceId: z.string().min(1, 'Conference ID is required'),
}).refine(
  (data) => {
    // Workshop formats require capacity
    if (isWorkshopFormat(data.format) && !data.capacity) {
      return false
    }
    return true
  },
  {
    message: 'Workshop capacity is required for workshop formats',
    path: ['capacity'],
  },
)

// Draft proposal schema - relaxed validation for saving work in progress
const ProposalDraftSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.array(z.any()).optional().default([]),
  language: z.nativeEnum(Language).optional().default(Language.norwegian),
  format: z.nativeEnum(Format).optional().default(Format.lightning_10),
  level: z.nativeEnum(Level).optional().default(Level.beginner),
  audiences: z.array(z.nativeEnum(Audience)).optional().default([]),
  outline: z.string().nullable().optional().transform(nullToUndefined),
  topics: z.array(ReferenceSchema).optional().default([]),
  tos: z.boolean().optional().default(false),
  video: z.string().nullable().optional().transform(nullToUndefined),
  capacity: z.number().nullable().optional().transform(nullToUndefined),
  speakers: z
    .array(ReferenceSchema)
    .nullable()
    .optional()
    .transform(nullToUndefined),
})

// Create proposal schema - uses draft (permissive) for the data, with status
// controlling whether strict validation is enforced at runtime
export const CreateProposalSchema = z.object({
  data: ProposalDraftSchema,
  status: z.enum(['draft', 'submitted']).default('submitted'),
})

// Proposal update schema — uses relaxed validation; strict checks enforced
// at runtime in the router for non-draft proposals
export const ProposalUpdateSchema = ProposalDraftSchema.partial().required({
  title: true,
})

// Admin update schema with speaker IDs
export const ProposalAdminUpdateSchema =
  ProposalInputBaseSchema.partial().extend({
    speakers: z.array(z.string()).optional(),
  })

// Proposal action schema
// Used for validating proposal status change actions (submit, accept, reject, etc.)
export const ProposalActionSchema = z.object({
  action: z.nativeEnum(Action),
  notify: z.boolean().optional().default(true),
  comment: z.string().nullable().optional().transform(nullToUndefined),
})

// Co-speaker invitation schemas
export const InvitationCreateSchema = z.object({
  proposalId: z.string().min(1, 'Proposal ID is required'),
  invitedEmail: z.string().email('Valid email is required'),
  invitedName: z.string().nullable().optional().transform(nullToUndefined),
})

export const InvitationResponseSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
  accept: z.boolean(),
  declineReason: z.string().nullable().optional().transform(nullToUndefined),
})

export const InvitationCancelSchema = z.object({
  invitationId: z.string().min(1, 'Invitation ID is required'),
})

export const AudienceFeedbackSchema = z.object({
  greenCount: z.number().int().min(0),
  yellowCount: z.number().int().min(0),
  redCount: z.number().int().min(0),
})

export const IdParamSchema = CommonIdParamSchema
