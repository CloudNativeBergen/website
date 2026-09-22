import { offAspectOverrides, resolvePublishMedia } from '@/lib/social/media'
import {
  countLength,
  validatePublishInput,
} from '@/lib/social/provider/constraints'
import type {
  PlatformConstraints,
  ValidationIssue,
} from '@/lib/social/provider/types'
import {
  SOCIAL_ALT_MAX_LENGTH,
  SOCIAL_LINK_MAX_LENGTH,
  type SocialPostAttachment,
  type SocialVariantAttachment,
  type SocialVariantEditorData,
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

/**
 * The same rules the router applies on save, run on every keystroke.
 * `conferenceDomains` is what the tenant-dependent rules need (the
 * first-comment rule, spec §3.1) — the editor read supplies it, and without
 * it those rules stay silent here while the router still refuses the save.
 */
export function validateEditorValue(
  value: VariantEditorValue,
  constraints: PlatformConstraints | null,
  postAttachments: SocialPostAttachment[],
  conferenceDomains: readonly string[] = [],
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
      ...validatePublishInput(
        constraints,
        { text: value.body, media, link: link || undefined },
        { conferenceDomains },
      ),
    )
  } else {
    // No platform rules yet: only what the router enforces for everyone.
    if (value.body.trim().length === 0) {
      issues.push({ field: 'body', message: 'The post is empty.' })
    }
    if (link && !/^https?:\/\/\S+$/i.test(link)) {
      issues.push({
        field: 'link',
        message: 'The link must start with http:// or https://.',
      })
    }
  }
  if (
    offAspectOverrides(value.attachments, postAttachments, constraints).length >
    0
  ) {
    issues.push({
      field: 'media',
      message: 'A crop does not match the platform image aspect.',
    })
  }
  // Storage limits the router enforces regardless of platform.
  if (link.length > SOCIAL_LINK_MAX_LENGTH) {
    issues.push({
      field: 'link',
      message: `The link is ${link.length} characters; the limit is ${SOCIAL_LINK_MAX_LENGTH}.`,
    })
  }
  if (
    value.attachments.some(
      (a) => (a.altOverride ?? '').length > SOCIAL_ALT_MAX_LENGTH,
    )
  ) {
    issues.push({
      field: 'media',
      message: `Alt text is limited to ${SOCIAL_ALT_MAX_LENGTH} characters.`,
    })
  }
  const timeError =
    value.timing.mode !== 'custom'
      ? null
      : !value.timing.localInput
        ? 'Pick a date and time for the custom time.'
        : osloLocalInputToIso(value.timing.localInput)
          ? null
          : 'The custom time is not a valid date and time.'
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
  /** The revision the editor loaded; the save is compare-and-set on it. */
  rev: string
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
  variant: { _id: string; _rev: string },
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
    variantId: variant._id,
    rev: variant._rev,
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
