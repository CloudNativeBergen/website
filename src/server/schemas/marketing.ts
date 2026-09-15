import { z } from 'zod'
import {
  BUILTIN_TEMPLATE_VERSION,
  optionalCampaigns,
} from '@/lib/marketing/template'
import { IsoDateTimeSchema, LiveDocumentIdSchema } from './social'

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

// ---------------------------------------------------------------------------
// `marketing.task.*` (spec §8, #1012)
// ---------------------------------------------------------------------------

export const TaskIdSchema = z.object({ taskId: LiveDocumentIdSchema })

const UrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => /^https?:\/\//.test(value), {
    message: 'The URL must start with http:// or https://',
  })

/** Non-variant fields; nullable + optional = "null clears". */
export const UpdateTaskSchema = z.object({
  taskId: LiveDocumentIdSchema,
  title: z.string().trim().min(1).max(200).optional(),
  instructions: z.string().trim().max(5000).nullable().optional(),
  externalUrl: UrlSchema.nullable().optional(),
})

export const SetTaskAssigneeSchema = z.object({
  taskId: LiveDocumentIdSchema,
  assigneeId: LiveDocumentIdSchema,
})

export const SetTaskPrerequisitesSchema = z.object({
  taskId: LiveDocumentIdSchema,
  prerequisiteIds: z
    .array(LiveDocumentIdSchema)
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Each Prerequisite at most once',
    }),
})

export const SetTaskDateSchema = z.object({
  taskId: LiveDocumentIdSchema,
  at: IsoDateTimeSchema,
})

export const CompleteTaskSchema = z.object({
  taskId: LiveDocumentIdSchema,
  /** eventPageUpdate: the optional pasted URL (spec §2.3). */
  externalUrl: UrlSchema.nullable().optional(),
})

export const SkipTaskSchema = z.object({
  taskId: LiveDocumentIdSchema,
  reason: z.string().trim().min(1, 'Say why the Task is skipped').max(500),
})
