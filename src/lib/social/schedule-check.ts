import { resolvePublishMedia } from './media'
import { resolveSocialPublishAdapter } from './provider'
import {
  getPlatformConstraints,
  validatePublishInput,
} from './provider/constraints'
import type { ValidationIssue } from './provider/types'
import type { SocialPostAttachment, SocialPostVariant } from './types'

/**
 * Why a variant may not enter `scheduled` (#788): the adapter's `validate`
 * when the organization is connected, the platform's client-safe rules
 * otherwise — the same rules the editor applies live, so a manual-channel
 * variant is held to them too. Shared by `social.scheduleVariant` and the
 * Marketing Task's approval (#1012), which is the same transition.
 */
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
  // Validation only: no card is fetched here, so no link-card hosts.
  const adapter = await resolveSocialPublishAdapter({
    ...variant,
    conferenceDomains: [],
  })
  if (adapter) return adapter.validate(input)
  return constraints ? validatePublishInput(constraints, input) : []
}
