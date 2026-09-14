import { SOCIAL_PLATFORM_LABELS, type SocialPlatform } from '../types'
import {
  PLATFORM_CONSTRAINTS,
  validatePublishInput,
  type ConstrainedPlatform,
} from './constraints'
import type {
  PlatformConstraints,
  PublishInput,
  PublishOutcome,
  SocialPublishAdapter,
  ValidationIssue,
} from './types'

/**
 * `ManualChannelProvider` (spec §4.2, #1006): the first `SocialPublishAdapter`
 * for LinkedIn. A manual Channel is executed BY HAND — the organizer copies
 * the text and rendition from the copy-ready view, posts on the platform and
 * pastes the post URL back — so this adapter contributes the platform's
 * rules (`constraints`, `validate`) and nothing else. `publish` is a typed
 * refusal that the engine never reaches: manual mode is DERIVED from the
 * organization having no connection for the platform (`provider/index.ts`
 * lists no `CONNECTION_FAMILY` for `linkedin`), so the resolver hands the
 * tick `null` and the variant goes to `awaiting-manual`. A LinkedIn API
 * adapter slots in later behind the same interface once #998 lands.
 *
 * Browser-safe: no credentials, no IO, so the copy-ready view can share
 * {@link postUrlIssue} with the router.
 */
export class ManualChannelProvider implements SocialPublishAdapter {
  readonly constraints: PlatformConstraints

  constructor(readonly platform: ConstrainedPlatform) {
    this.constraints = PLATFORM_CONSTRAINTS[platform]
  }

  validate(input: PublishInput): ValidationIssue[] {
    return validatePublishInput(this.constraints, input)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the contract's argument; a manual channel has nothing to send it to
  async publish(_input: PublishInput): Promise<PublishOutcome> {
    return {
      ok: false,
      kind: 'rejected',
      message: `${SOCIAL_PLATFORM_LABELS[this.platform]} has no connection: post it by hand from the copy-ready view and mark the variant posted.`,
    }
  }
}

/**
 * The registrable domain a platform's post URLs live on. A pasted URL is
 * accepted when its host IS this domain or a subdomain of it (LinkedIn
 * serves regional hosts such as `no.linkedin.com`). A platform absent here
 * has no fixed host (any Mastodon instance) and only the scheme is checked.
 */
const POST_URL_DOMAINS: Partial<Record<SocialPlatform, string>> = {
  linkedin: 'linkedin.com',
  bluesky: 'bsky.app',
  x: 'x.com',
  facebook: 'facebook.com',
  instagram: 'instagram.com',
  threads: 'threads.com',
}

function isOnDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

/**
 * Why a pasted post URL is not acceptable for the platform, or `null` when
 * it is (spec §3.2: "validated as `https://www.linkedin.com/...`"). Pure and
 * shared by `social.markPosted` and the copy-ready view, so the field and
 * the server refuse the same URLs with the same words.
 */
export function postUrlIssue(
  platform: SocialPlatform,
  url: string,
): string | null {
  const label = SOCIAL_PLATFORM_LABELS[platform]
  const domain = POST_URL_DOMAINS[platform]
  const example = domain ? `https://www.${domain}/…` : 'https://…'
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return `Paste the https address of the post on ${label} (${example}).`
  }
  if (parsed.protocol !== 'https:') {
    return `Paste the https address of the post on ${label} (${example}).`
  }
  if (domain && !isOnDomain(parsed.hostname, domain)) {
    return `That is not a ${label} address: the post URL must be on ${domain} (${example}).`
  }
  if (parsed.pathname === '/' || parsed.pathname === '') {
    return `That is the ${label} front page, not a post: paste the path to the post itself.`
  }
  return null
}
