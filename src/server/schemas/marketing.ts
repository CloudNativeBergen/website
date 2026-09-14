import { z } from 'zod'
import {
  BUILTIN_TEMPLATE_VERSION,
  optionalCampaigns,
} from '@/lib/marketing/template'

const OPTIONAL_KEYS = optionalCampaigns().map((c) => c.key)

/**
 * `marketing.plan.seed` (spec §8). The Template version is pinned to the
 * built-in one this build ships: a client asking for another version is
 * asking for data this code does not have.
 */
export const SeedPlanSchema = z.object({
  templateVersion: z.literal(BUILTIN_TEMPLATE_VERSION),
  includeOptional: z
    .array(z.string().min(1).max(64))
    .max(OPTIONAL_KEYS.length)
    .default([])
    .refine((keys) => keys.every((k) => OPTIONAL_KEYS.includes(k)), {
      message: `Optional Campaigns are: ${OPTIONAL_KEYS.join(', ')}`,
    })
    .refine((keys) => new Set(keys).size === keys.length, {
      message: 'Each optional Campaign at most once',
    }),
})

export type SeedPlanInput = z.infer<typeof SeedPlanSchema>
