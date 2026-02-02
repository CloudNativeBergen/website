import { z } from 'zod'
import { Flags } from '@/lib/speaker/types'
import { nullToUndefined, IdParamSchema as CommonIdParamSchema } from './common'

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
  consent: SpeakerConsentSchema.optional(),
  company: z.string().nullable().optional().transform(nullToUndefined),
})

// Admin-specific speaker creation (includes email)
export const SpeakerCreateSchema = SpeakerInputBaseSchema.extend({
  email: z.string().email('Valid email is required'),
}).refine(
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

// Partial update schema
export const SpeakerUpdateSchema = SpeakerInputBaseSchema.partial()

// ID parameter schema (re-exported from common)
export const IdParamSchema = CommonIdParamSchema
