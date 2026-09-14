import { resolvePublishMedia } from '@/lib/social/media'
import {
  countLength,
  validatePublishInput,
} from '@/lib/social/provider/constraints'
import type {
  PlatformConstraints,
  ValidationIssue,
} from '@/lib/social/provider/types'
import type {
  SocialPostAttachment,
  SocialVariantAttachment,
  SocialVariantEditorData,
} from '@/lib/social/types'
import { instantToOsloLocalInput, osloLocalInputToIso } from '@/lib/time'

/**
 * The editor's form state and the pure functions around it: load from the
 * router's data, validate live with the platform's rules, and turn the
 * form into the `social.updateVariant` input. No React in here so the
 * conversions are unit-testable and the component stays presentational.
 */

export type EditorTiming =
  | { mode: 'default' }
  /** `datetime-local` value in the conference (Europe/Oslo) wall clock. */
  | { mode: 'custom'; localInput: string }

export interface VariantEditorValue {
  body: string
  link: string
  attachments: SocialVariantAttachment[]
  timing: EditorTiming
}

export function editorValueFrom(
  data: SocialVariantEditorData,
): VariantEditorValue {
  const { variant } = data
  return {
    body: variant.body,
    link: variant.link ?? '',
    attachments: variant.attachments,
    timing: variant.usesCustomTime
      ? {
          mode: 'custom',
          localInput: instantToOsloLocalInput(variant.scheduledAt ?? undefined),
        }
      : { mode: 'default' },
  }
}

export interface EditorValidation {
  issues: ValidationIssue[]
  /** Length the way the platform counts it. */
  length: number
  byField: Record<ValidationIssue['field'], string[]>
  /** The custom time, when set, does not parse. Not a platform issue. */
  timeError: string | null
}

/** The same rules the router applies on save, run on every keystroke. */
export function validateEditorValue(
  value: VariantEditorValue,
  constraints: PlatformConstraints | null,
  postAttachments: SocialPostAttachment[],
): EditorValidation {
  const issues: ValidationIssue[] = []
  const resolved = resolvePublishMedia(
    value.attachments,
    postAttachments,
    constraints,
  )
  if (resolved === null) {
    // The router refuses this too; say so before the round trip.
    issues.push({
      field: 'media',
      message: 'An image is no longer on the post. Remove it to continue.',
    })
  }
  const media = resolved ?? []
  const link = value.link.trim()
  if (constraints) {
    issues.push(
      ...validatePublishInput(constraints, {
        text: value.body,
        media,
        link: link || undefined,
      }),
    )
  } else if (link && !/^https?:\/\/\S+$/i.test(link)) {
    issues.push({
      field: 'link',
      message: 'The link must start with http:// or https://.',
    })
  }
  const timeError =
    value.timing.mode === 'custom' &&
    value.timing.localInput &&
    !osloLocalInputToIso(value.timing.localInput)
      ? 'The custom time is not a valid date and time.'
      : null
  const byField: EditorValidation['byField'] = { body: [], media: [], link: [] }
  for (const issue of issues) byField[issue.field].push(issue.message)
  return {
    issues,
    length: countLength(value.body, constraints?.counting ?? 'characters'),
    byField,
    timeError,
  }
}

export interface UpdateVariantInput {
  variantId: string
  body: string
  link: string | null
  attachments: SocialVariantAttachment[]
  timing: { mode: 'default' } | { mode: 'custom'; scheduledAt: string }
}

/**
 * The mutation input, or `null` when a custom time is missing/invalid —
 * the one thing `validateEditorValue` cannot express as a field issue.
 */
export function toUpdateInput(
  variantId: string,
  value: VariantEditorValue,
): UpdateVariantInput | null {
  let timing: UpdateVariantInput['timing']
  if (value.timing.mode === 'custom') {
    const scheduledAt = osloLocalInputToIso(value.timing.localInput)
    if (!scheduledAt) return null
    timing = { mode: 'custom', scheduledAt }
  } else {
    timing = { mode: 'default' }
  }
  const link = value.link.trim()
  return {
    variantId,
    body: value.body,
    link: link || null,
    attachments: value.attachments.map((a) => ({
      source: a.source,
      crop: a.crop,
      altOverride: a.altOverride,
    })),
    timing,
  }
}
