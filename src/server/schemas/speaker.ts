import { z } from 'zod'
import {
  Flags,
  genderOptions,
  genderPreferToSelfDescribe,
} from '@/lib/speaker/types'
import { nullToUndefined, IdParamSchema as CommonIdParamSchema } from './common'

/**
 * Cross-field rule: a free-text `genderSelfDescribe` value is only meaningful
 * when `gender` is the self-describe preset. Reject it otherwise so studio and
 * API stay consistent with the shared `genderOptions` presets.
 */
const refineGenderSelfDescribe = (
  data: { gender?: string | null; genderSelfDescribe?: string | null },
  ctx: z.RefinementCtx,
) => {
  if (data.genderSelfDescribe && data.gender !== genderPreferToSelfDescribe) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Self-described gender is only allowed when gender is "${genderPreferToSelfDescribe}"`,
      path: ['genderSelfDescribe'],
    })
  }
}

// Consent record schema
const ConsentRecordSchema = z.object({
  granted: z.boolean(),
  grantedAt: z.string().optional(),
  withdrawnAt: z.string().optional(),
  ipAddress: z.string().optional(),
})

// Speaker consent schema
const SpeakerConsentSchema = z.object({
  dataProcessing: ConsentRecordSchema.optional(),
  marketing: ConsentRecordSchema.optional(),
  publicProfile: ConsentRecordSchema.optional(),
  photography: ConsentRecordSchema.optional(),
  privacyPolicyVersion: z.string().optional(),
})

// Speaker input schema (for create/update)
export const SpeakerInputSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    slug: z.string().nullable().optional().transform(nullToUndefined),
    title: z.string().nullable().optional().transform(nullToUndefined),
    bio: z.string().nullable().optional().transform(nullToUndefined),
    image: z.string().nullable().optional().transform(nullToUndefined),
    links: z.array(z.string()).optional(),
    flags: z.array(z.nativeEnum(Flags)).optional(),
    gender: z
      .enum(genderOptions)
      .nullable()
      .optional()
      .transform(nullToUndefined),
    genderSelfDescribe: z
      .string()
      .nullable()
      .optional()
      .transform(nullToUndefined),
    country: z.string().nullable().optional().transform(nullToUndefined),
    consent: SpeakerConsentSchema.optional(),
    company: z.string().nullable().optional().transform(nullToUndefined),
  })
  .refine(
    (data) => {
      // Links cannot be empty strings
      if (data.links && data.links.some((link) => link === '')) {
        return false
      }
      return true
    },
    {
      message: 'Links cannot be empty',
      path: ['links'],
    },
  )
  .superRefine(refineGenderSelfDescribe)

// Email update schema
export const EmailUpdateSchema = z.object({
  email: z.string().email('Valid email is required'),
})

// Base schema without refinements for extending
const SpeakerInputBaseSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().nullable().optional().transform(nullToUndefined),
  title: z.string().nullable().optional().transform(nullToUndefined),
  bio: z.string().nullable().optional().transform(nullToUndefined),
  image: z.string().nullable().optional().transform(nullToUndefined),
  links: z.array(z.string()).optional(),
  flags: z.array(z.nativeEnum(Flags)).optional(),
  gender: z
    .enum(genderOptions)
    .nullable()
    .optional()
    .transform(nullToUndefined),
  genderSelfDescribe: z
    .string()
    .nullable()
    .optional()
    .transform(nullToUndefined),
  country: z.string().nullable().optional().transform(nullToUndefined),
  consent: SpeakerConsentSchema.optional(),
  company: z.string().nullable().optional().transform(nullToUndefined),
})

// Admin-specific speaker creation (includes email)
export const SpeakerCreateSchema = SpeakerInputBaseSchema.extend({
  email: z.string().email('Valid email is required'),
})
  .refine(
    (data) => {
      // Links cannot be empty strings
      if (data.links && data.links.some((link) => link === '')) {
        return false
      }
      return true
    },
    {
      message: 'Links cannot be empty',
      path: ['links'],
    },
  )
  .superRefine(refineGenderSelfDescribe)

// Partial update schema
export const SpeakerUpdateSchema = SpeakerInputBaseSchema.partial().superRefine(
  refineGenderSelfDescribe,
)

// ID parameter schema (re-exported from common)
export const IdParamSchema = CommonIdParamSchema

export const SpeakerSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  includeFeatured: z.boolean().optional().default(false),
})

/**
 * Merge two duplicate speaker documents (identity Phase 3). `survivorId` is the
 * canonical record kept (its slug/URL is preserved); `loserId` is folded in and
 * deleted. A server-side guard rejects a self-merge, but we also block it here
 * so the client can't even request it.
 */
export const SpeakerMergeSchema = z
  .object({
    survivorId: z.string().min(1, 'Survivor speaker id is required'),
    loserId: z.string().min(1, 'Loser speaker id is required'),
  })
  .refine((data) => data.survivorId !== data.loserId, {
    message: 'Cannot merge a speaker into itself',
    path: ['loserId'],
  })
