import { z } from 'zod'
import {
  BUILTIN_TEMPLATE_VERSION,
  optionalCampaigns,
} from '@/lib/marketing/template'
import {
  IsoDateTimeSchema,
  LiveDocumentIdSchema,
  SitePathSchema,
} from './social'
import { SendMessageSchema } from './message'

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

/** `marketing.plan.copy` (spec §8, #1017): which previous edition's plan. */
export const CopyPlanSchema = z.object({ fromPlanId: LiveDocumentIdSchema })

/** `marketing.plan.setOwner` (spec §3.1): the organizer the plan is delegated to. */
export const SetPlanOwnerSchema = z.object({ ownerId: LiveDocumentIdSchema })

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

/**
 * The Task revision the editor LOADED. When given, the write is
 * compare-and-set on it, so a colleague's edit since the editor opened
 * conflicts instead of being overwritten; without it the write is
 * compare-and-set on the revision read in the same request only.
 */
const LoadedRevSchema = z.string().min(1).max(200).optional()

/** Non-variant fields; nullable + optional = "null clears". */
export const UpdateTaskSchema = z.object({
  taskId: LiveDocumentIdSchema,
  rev: LoadedRevSchema,
  title: z.string().trim().min(1).max(200).optional(),
  instructions: z.string().trim().max(5000).nullable().optional(),
  externalUrl: UrlSchema.nullable().optional(),
  targetPage: SitePathSchema.optional(),
})

export const SetTaskAssigneeSchema = z.object({
  taskId: LiveDocumentIdSchema,
  assigneeId: LiveDocumentIdSchema,
})

export const SetTaskPrerequisitesSchema = z.object({
  taskId: LiveDocumentIdSchema,
  /** The whole list is written; the loaded revision keeps two editors from crossing. */
  rev: LoadedRevSchema,
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

// ---------------------------------------------------------------------------
// `marketing.campaign.*` (spec §8, #1018)
// ---------------------------------------------------------------------------

/** The Campaign the ledger opens. Ownership is proven server-side, never here. */
export const CampaignIdSchema = z.object({ campaignId: LiveDocumentIdSchema })

/** The upload has already bound this asset to this Task. */
export const AttachTaskAssetSchema = z.object({
  taskId: LiveDocumentIdSchema,
  taskRev: z.string().min(1).max(200),
  assetId: z.string().regex(/^image-[A-Za-z0-9]+-\d+x\d+-[a-z0-9]+$/),
})

/**
 * Outreach keeps messaging's size rules and refuses unfilled template tokens.
 *
 * Deliberately NOT `unresolvedPlaceholders`: that only knows the conference and
 * subject placeholder names, so an invented token like `{recipient}` would sail
 * through to a real person. Matching a single bare word instead catches every
 * placeholder shape while leaving ordinary prose — `{1,2,3}`, `{up to 500 NOK}` —
 * sendable.
 */
const PLACEHOLDER_TOKEN = /\{[A-Za-z][A-Za-z0-9_]*\}/

export const SendOutreachSchema = z.object({
  taskId: LiveDocumentIdSchema,
  rev: z.string().min(1).max(200),
  body: SendMessageSchema.shape.body.refine(
    (body) => !PLACEHOLDER_TOKEN.test(body),
    'Replace all {placeholders} before sending outreach.',
  ),
})

export const CreateOutreachTaskSchema = z.object({
  campaignId: LiveDocumentIdSchema,
  kind: z.enum(['speakerOutreach', 'sponsorOutreach']),
  subjectId: LiveDocumentIdSchema,
  title: z.string().trim().min(1).max(200),
  targetPage: SitePathSchema,
  dueAt: IsoDateTimeSchema,
})
