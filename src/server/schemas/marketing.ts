import { LIBRARY_IDS } from '@/lib/marketing/library'
import { MILESTONES } from '@/lib/marketing/milestones'
import { OUTCOMES, TASK_KINDS, MARKETING_CHANNELS } from '@/lib/marketing/types'
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
import { isCalendarDate } from '@/lib/time'

// ---------------------------------------------------------------------------
// marketing.report.* — observation dates, with an exclusive upper boundary
// ---------------------------------------------------------------------------

const ReportDateSchema = z.string().refine(isCalendarDate, {
  message: 'Use a valid calendar date (YYYY-MM-DD)',
})

export const MarketingReportSchema = z
  .object({
    from: ReportDateSchema.optional(),
    to: ReportDateSchema.optional(),
    grain: z.enum(['daily', 'weekly']).default('daily'),
  })
  .strict()
  .refine((input) => Boolean(input.from) === Boolean(input.to), {
    message: 'Supply both range boundaries, or neither for the plan range',
  })
  .refine((input) => !input.from || !input.to || input.from < input.to, {
    message: 'The exclusive end must be after the start',
  })

const OPTIONAL_KEYS = optionalCampaigns().map((c) => c.key)

const IncludeOptionalSchema = z
  .array(z.string().min(1).max(64))
  .max(OPTIONAL_KEYS.length)
  .default([])
  .refine((keys) => keys.every((k) => OPTIONAL_KEYS.includes(k)), {
    message: `Optional Campaigns are: ${OPTIONAL_KEYS.join(', ')}`,
  })
  .refine((keys) => new Set(keys).size === keys.length, {
    message: 'Each optional Campaign at most once',
  })

/**
 * `marketing.plan.create` (Templates spec §3, §7): what the new plan starts
 * from. The built-in Template version is pinned to the one this build ships:
 * a client asking for another version is asking for data this code does not
 * have. Copying a previous edition stays `marketing.plan.copy`.
 */
/** A `randomUUID()`: it is spliced into a document id, so nothing else passes. */
const TemplateIdSchema = z.string().uuid()
const TemplateVersionNumberSchema = z.number().int().min(1).max(100_000)
const TemplateNameSchema = z.string().trim().min(1).max(120)

export const CreatePlanSchema = z.object({
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('blank') }).strict(),
    z
      .object({
        type: z.literal('builtin'),
        templateVersion: z.literal(BUILTIN_TEMPLATE_VERSION),
        includeOptional: IncludeOptionalSchema,
      })
      .strict(),
    // An organization Template: an id and a version, NEVER an organization —
    // the Template is resolved against the conference's own (§3).
    z
      .object({
        type: z.literal('template'),
        templateId: TemplateIdSchema,
        version: TemplateVersionNumberSchema,
        includeOptional: z.array(z.string().min(1).max(100)).max(50),
      })
      .strict(),
  ]),
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
/**
 * The same value, REQUIRED. `campaign.update` overwrites every field it is
 * given, so an omitted `rev` skipped the guard AND bound the write to the
 * revision the server had just read — a plain read-then-write that silently
 * discards a concurrent edit. That is exactly what the editor's mounted-copy
 * latch exists to prevent, and one missing field defeated it.
 */
const RequiredRevSchema = z.string().min(1).max(200)

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
 * through to a real person. This matches braces around an ASCII letter followed
 * by letters, digits or underscores, covering every token in both built-in
 * outreach skeletons. It also rejects single-word prose such as `{thanks}`, but
 * does not match `{_recipient}`, `{first-name}`, `{1,2,3}` or `{up to 500 NOK}`.
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

const OffsetDaysSchema = z.number().int().min(-365).max(365)
const AnchorSchema = z
  .object({ milestone: z.enum(MILESTONES), offsetDays: OffsetDaysSchema })
  .strict()

export const CreateTaskSchema = z
  .object({
    campaignId: LiveDocumentIdSchema,
    kind: z.enum(TASK_KINDS),
    channel: z.enum(MARKETING_CHANNELS).optional(),
    alsoCreateSibling: z.boolean().default(false),
    subjectId: LiveDocumentIdSchema.optional(),
    title: z.string().trim().min(1).max(200),
    targetPage: SitePathSchema.optional(),
    instructions: z.string().trim().max(5000).optional(),
    /** A bare date, which leaves the Task unanchored … */
    dueAt: IsoDateTimeSchema.optional(),
    /** … or a Milestone + offset, which re-dates with the edition (§2.2). */
    anchor: AnchorSchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if ((input.anchor === undefined) === (input.dueAt === undefined))
      ctx.addIssue({
        code: 'custom',
        path: ['dueAt'],
        message: 'Give either a date, or a Milestone and an offset in days.',
      })
    const outreach =
      input.kind === 'speakerOutreach' || input.kind === 'sponsorOutreach'
    const requireField = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })
    if (input.kind === 'publishing' && !input.channel)
      requireField('channel', 'Choose a Channel for a publishing Task.')
    if ((input.kind === 'publishing' || outreach) && !input.targetPage)
      requireField('targetPage', 'Choose a destination page for this Task.')
    if (outreach && !input.subjectId)
      requireField('subjectId', 'Choose the outreach recipient.')
    if (!outreach && input.subjectId)
      requireField('subjectId', 'Only outreach Tasks accept a recipient.')
    if (input.kind !== 'publishing' && input.alsoCreateSibling)
      requireField(
        'alsoCreateSibling',
        'Only publishing Tasks have Channel siblings.',
      )
    // The mirror of the `alsoCreateSibling` rule, which was missing. A
    // `channel` on a non-publishing Kind is persisted by `materializeTask`, and
    // then the chip paints that Channel's glyph and label on it and the Channel
    // filter matches it — while `ceiling-check` counts only publishing Tasks,
    // so it sits under a Channel it can never post to and outside that
    // Channel's ceiling. The form omits the field, so only a direct call can
    // do it; every other Kind-specific field is already guarded both ways.
    if (input.kind !== 'publishing' && input.channel)
      requireField('channel', 'Only publishing Tasks have a Channel.')
  })

export const CampaignWindowSchema = z
  .object({
    startMilestone: z.enum(MILESTONES),
    startOffsetDays: OffsetDaysSchema,
    endMilestone: z.enum(MILESTONES),
    endOffsetDays: OffsetDaysSchema,
  })
  .strict()
const CampaignFields = {
  title: z.string().trim().min(1).max(200),
  primaryOutcome: z.enum(OUTCOMES),
  outcomeTargetPage: SitePathSchema.nullable().optional(),
  target: z.number().int().min(0).max(1_000_000).nullable().optional(),
  window: CampaignWindowSchema,
  /** A Template saved from this plan asks before creating the Campaign. */
  optional: z.boolean().optional(),
}
export const CreateCampaignSchema = z.object(CampaignFields).strict()
export const UpdateCampaignSchema = z
  .object({
    ...CampaignFields,
    campaignId: LiveDocumentIdSchema,
    rev: RequiredRevSchema,
    title: CampaignFields.title.optional(),
    primaryOutcome: CampaignFields.primaryOutcome.optional(),
    window: CampaignWindowSchema.optional(),
  })
  .strict()
// ---------------------------------------------------------------------------
// `marketing.campaign.recipes.*` and `campaign.addBuiltin` (Templates spec §4.2, §5)
// ---------------------------------------------------------------------------

const RecipeChannelSchema = z
  .object({
    skeleton: z.string().trim().min(1).max(3000),
    perWeek: z.number().int().min(1).max(21).optional(),
  })
  .strict()
/** What §5.2 lets an organizer change; the Library entry fixes the rest. */
export const RecipeEditsSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    channels: z
      .object({
        linkedin: RecipeChannelSchema.optional(),
        bluesky: RecipeChannelSchema.optional(),
      })
      .strict(),
    window: z
      .object({ from: AnchorSchema, to: AnchorSchema })
      .strict()
      .optional(),
    alt: z.string().trim().max(1000).optional(),
    instructions: z.string().trim().max(5000).optional(),
  })
  .strict()
const CampaignRecipeFields = {
  campaignId: LiveDocumentIdSchema,
  rev: RequiredRevSchema,
  entry: z.enum(LIBRARY_IDS),
}
export const AttachRecipeSchema = z
  .object({ ...CampaignRecipeFields, edits: RecipeEditsSchema.optional() })
  .strict()
export const UpdateRecipeSchema = z
  .object({ ...CampaignRecipeFields, edits: RecipeEditsSchema })
  .strict()
export const RemoveRecipeSchema = z.object(CampaignRecipeFields).strict()
export const AddBuiltinCampaignSchema = z
  .object({ key: z.string().min(1).max(100) })
  .strict()

export const DeleteCampaignSchema = z
  .object({
    campaignId: LiveDocumentIdSchema,
    confirmTitle: z.string().max(500).optional(),
  })
  .strict()

export const DeletePlanSchema = z
  .object({ confirmTitle: z.string().max(500).optional() })
  .strict()

// ---------------------------------------------------------------------------
// `marketing.template.*` (Templates spec §6, §7)
// ---------------------------------------------------------------------------

export const TemplateIdInputSchema = z
  .object({ templateId: TemplateIdSchema })
  .strict()
export const TemplateVersionInputSchema = z
  .object({
    templateId: TemplateIdSchema,
    version: TemplateVersionNumberSchema,
  })
  .strict()
export const SaveTemplateSchema = z
  .object({
    target: z.discriminatedUnion('type', [
      z.object({ type: z.literal('new'), name: TemplateNameSchema }).strict(),
      z
        .object({ type: z.literal('version'), templateId: TemplateIdSchema })
        .strict(),
    ]),
    /** The review list's answers, by Task id (§6.2). */
    decisions: z
      .object({
        anchors: z.record(LiveDocumentIdSchema, AnchorSchema).optional(),
        copy: z
          .record(LiveDocumentIdSchema, z.string().trim().min(1).max(3000))
          .optional(),
      })
      .strict(),
  })
  .strict()
export const RenameTemplateSchema = z
  .object({ templateId: TemplateIdSchema, name: TemplateNameSchema })
  .strict()
export const DeleteTemplateSchema = z
  .object({ templateId: TemplateIdSchema, confirmName: z.string().max(500) })
  .strict()
