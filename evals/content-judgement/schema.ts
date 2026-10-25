import { readFileSync } from 'node:fs'
import { z } from 'zod'

export const surfaces = [
  'wall-caption',
  'feedback-comment',
  'conversation-opening',
  'wall-photo',
] as const
export const languages = ['nb', 'nn', 'en', 'mixed'] as const
export const categories = [
  'talk_details',
  'proposal_status',
  'account_and_site',
  'schedule',
  'travel_and_visa',
  'tickets',
  'other',
] as const
export const moderationKeys = [
  'abusive',
  'sexual',
  'spam',
  'personal_info',
] as const
const moderationTags = [
  'benign',
  'abusive',
  'sexual',
  'spam',
  'personal_info',
  'evasion',
  'borderline',
  'nynorsk',
  'sponsor',
] as const

export type Surface = (typeof surfaces)[number]
export type ModerationSurface = Exclude<
  Surface,
  'conversation-opening' | 'wall-photo'
>
export type Language = (typeof languages)[number]
export type Category = (typeof categories)[number]
export type ModerationKey = (typeof moderationKeys)[number]

const uniqueTags = (tags: string[]) => new Set(tags).size === tags.length
const labelsSchema = z.strictObject({
  abusive: z.boolean(),
  sexual: z.boolean(),
  spam: z.boolean(),
  personal_info: z.boolean(),
})
const shared = {
  lang: z.enum(languages),
  note: z.string().min(1).optional(),
}
const moderationShared = {
  ...shared,
  labels: labelsSchema,
}

export const wallCaptionSchema = z.strictObject({
  ...moderationShared,
  id: z.string().regex(/^wc-\d{3}$/),
  text: z.string().min(1).max(80),
  tags: z.array(z.enum(moderationTags)).min(1).refine(uniqueTags),
})
export const feedbackCommentSchema = z.strictObject({
  ...moderationShared,
  id: z.string().regex(/^fc-\d{3}$/),
  text: z.string().min(1).max(400),
  tags: z
    .array(z.enum([...moderationTags, 'harsh_fair']))
    .min(1)
    .refine(uniqueTags),
})
export const conversationOpeningSchema = z.strictObject({
  ...shared,
  id: z.string().regex(/^co-\d{3}$/),
  subject: z.string().min(1),
  text: z.string().min(1),
  openedBy: z.enum(['speaker', 'organizer']),
  category: z.enum(categories),
  tags: z.array(z.string().min(1)).refine(uniqueTags),
})

export const wallPhotoSchema = z
  .strictObject({
    id: z.string().regex(/^wp-\d{3}$/),
    caption: z.string().min(1).max(80).optional(),
    lang: z.enum(languages).optional(),
    image: z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('fetched'),
        url: z.url({ protocol: /^https?$/ }),
        page: z.url({ protocol: /^https?$/ }),
        author: z.string().min(1),
        licence: z.enum(['CC0-1.0', 'PDM-1.0']),
        sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
      }),
      z.strictObject({
        kind: z.literal('generated'),
        generator: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      }),
    ]),
    labels: z.strictObject({
      caption: labelsSchema.optional(),
      photo: labelsSchema,
    }),
    tags: z
      .array(
        z.enum([
          'benign',
          'borderline',
          'spam',
          'personal_info',
          'caption_flag',
          'no_caption',
        ]),
      )
      .min(1)
      .refine(uniqueTags),
    note: shared.note,
  })
  .refine(
    (item) =>
      (item.caption !== undefined) === (item.lang !== undefined) &&
      (item.caption !== undefined) === (item.labels.caption !== undefined),
  )

export type WallPhotoItem = z.infer<typeof wallPhotoSchema>

export type ModerationItem = z.infer<typeof feedbackCommentSchema>
export type ConversationItem = z.infer<typeof conversationOpeningSchema>
export type DataItem = ModerationItem | ConversationItem | WallPhotoItem

export function loadData(surface: ModerationSurface): ModerationItem[]
export function loadData(surface: 'conversation-opening'): ConversationItem[]
export function loadData(surface: 'wall-photo'): WallPhotoItem[]
export function loadData(surface: Surface): DataItem[]
export function loadData(surface: Surface): DataItem[] {
  const schema =
    surface === 'wall-caption'
      ? wallCaptionSchema
      : surface === 'wall-photo'
        ? wallPhotoSchema
        : surface === 'feedback-comment'
          ? feedbackCommentSchema
          : conversationOpeningSchema
  const lines = readFileSync(
    new URL(`./data/${surface}.jsonl`, import.meta.url),
    'utf8',
  )
    .trim()
    .split(/\r?\n/)
  const ids = new Set<string>()
  return lines.map((line, index) => {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw new Error(`${surface} line ${index + 1}: invalid JSON`)
    }
    const result = schema.safeParse(value)
    if (!result.success) {
      // Zod diagnostics can contain the supplied content. Keep it out of logs.
      throw new Error(`${surface} line ${index + 1}: invalid schema`)
    }
    if (ids.has(result.data.id)) {
      throw new Error(`${surface} line ${index + 1}: duplicate id`)
    }
    ids.add(result.data.id)
    return result.data
  })
}
