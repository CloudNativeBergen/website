import { resolvePublishMedia } from './media'
import { resolveSocialPublishAdapter } from './provider'
import {
  getPlatformConstraints,
  validatePublishInput,
} from './provider/constraints'
import { unresolvedPlaceholders } from '@/lib/marketing/placeholders'
import type { PublishInput, ValidationIssue } from './provider/types'
import type { SocialPostAttachment, SocialPostVariant } from './types'

/**
 * Why a variant may not enter `scheduled` (#788): the adapter's `validate`
 * when the organization is connected, the platform's client-safe rules
 * otherwise — the same rules the editor applies live, so a manual-channel
 * variant is held to them too. Shared by `social.scheduleVariant` and the
 * Marketing Task's approval (#1012), which is the same transition.
 */
/**
 * A Marketing Task's copy skeleton leaves `{hook}` (and any subject value it
 * had no data for) for the organizer to write. A draft may carry them; a post
 * that is queued or handed over for manual posting must not, or the literal
 * `{hook}` goes out. Checked on the body and on every image's alt text.
 */
export function placeholderIssues(
  input: Pick<PublishInput, 'text' | 'media'>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const inBody = unresolvedPlaceholders(input.text)
  if (inBody.length > 0) {
    issues.push({
      field: 'body',
      message: `Fill in ${inBody.map((p) => `{${p}}`).join(', ')} before scheduling.`,
    })
  }
  const inAlt = [
    ...new Set(input.media.flatMap((m) => unresolvedPlaceholders(m.alt ?? ''))),
  ]
  if (inAlt.length > 0) {
    issues.push({
      field: 'media',
      message: `Fill in ${inAlt.map((p) => `{${p}}`).join(', ')} in the alt text before scheduling.`,
    })
  }
  return issues
}

export async function scheduleIssues(
  variant: SocialPostVariant,
  postAttachments: SocialPostAttachment[],
): Promise<ValidationIssue[]> {
  const constraints = getPlatformConstraints(variant.platform)
  const media = resolvePublishMedia(
    variant.attachments,
    postAttachments,
    constraints,
  )
  if (!media) {
    return [
      {
        field: 'media',
        message: 'An attachment is no longer on the post. Reload and retry.',
      },
    ]
  }
  const input = {
    text: variant.body,
    media,
    link: variant.link ?? undefined,
  }
  const placeholders = placeholderIssues(input)
  if (placeholders.length > 0) return placeholders
  // Validation only: no card is fetched here, so no link-card hosts.
  const adapter = await resolveSocialPublishAdapter({
    ...variant,
    conferenceDomains: [],
  })
  if (adapter) return adapter.validate(input)
  return constraints ? validatePublishInput(constraints, input) : []
}
