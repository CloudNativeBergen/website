import { z } from 'zod'
import { FEATURE_IDS } from '@/lib/features/registry'
import { ORGANIZATION_PLANS } from '@/lib/organization/types'

/**
 * Schemas for the `platform` router (feature entitlements foundation). The
 * feature id and plan enums are derived from the code registries so a value
 * outside the closed unions is rejected at the boundary — an override for an
 * unknown feature can therefore never be STORED via this API (the resolver
 * additionally ignores unknown ids read from Sanity, for stale data).
 */

export const PlanSchema = z.enum(ORGANIZATION_PLANS)

export const FeatureOverrideInputSchema = z.object({
  // Client-supplied keys are kept where possible (stable React identity) and
  // de-duplicated/backfilled server-side via `ensureUniqueArrayKeys`.
  _key: z.string().optional(),
  feature: z.enum(FEATURE_IDS),
  enabled: z.boolean(),
  note: z.string().trim().max(500).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
})

export const UpdateEntitlementsSchema = z.object({
  organizationId: z.string().trim().min(1, 'An organization id is required'),
  plan: PlanSchema,
  overrides: z.array(FeatureOverrideInputSchema).max(100),
})

export type UpdateEntitlementsInput = z.infer<typeof UpdateEntitlementsSchema>
