import { SOCIAL_PLATFORM_LABELS, type SocialPlatform } from '../types'
import {
  PLATFORM_CONSTRAINTS,
  validatePublishInput,
  type ConstrainedPlatform,
} from './constraints'
import type {
  PlatformConstraints,
  PublishContext,
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

  validate(
    input: PublishInput,
    context: PublishContext = {},
  ): ValidationIssue[] {
    return validatePublishInput(this.constraints, input, context)
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
 * The registrable domains a platform's post URLs live on, the first being
 * the canonical one. A pasted URL is accepted when its host IS one of them
 * or a subdomain of one (spec §3.2 names `www.linkedin.com`; LinkedIn also
 * serves regional hosts such as `no.linkedin.com`, X still answers on
 * `twitter.com`, Threads on both `threads.com` and `threads.net`). A
 * platform absent here has no fixed host (any Mastodon instance) and only
 * the scheme is checked.
 */
const POST_URL_DOMAINS: Partial<Record<SocialPlatform, readonly string[]>> = {
  linkedin: ['linkedin.com'],
  bluesky: ['bsky.app'],
  x: ['x.com', 'twitter.com'],
  facebook: ['facebook.com'],
  instagram: ['instagram.com'],
  threads: ['threads.com', 'threads.net'],
}

function isOnDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

/** The shape of a post URL on the platform, for placeholders and refusals. */
export function postUrlExample(platform: SocialPlatform): string {
  const domain = POST_URL_DOMAINS[platform]?.[0]
  return domain ? `https://www.${domain}/…` : 'https://…'
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
  const domains = POST_URL_DOMAINS[platform]
  const example = postUrlExample(platform)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return `Paste the https address of the post on ${label} (${example}).`
  }
  if (parsed.protocol !== 'https:') {
    return `Paste the https address of the post on ${label} (${example}).`
  }
  if (domains && !domains.some((d) => isOnDomain(parsed.hostname, d))) {
    return `That is not a ${label} address: the post URL must be on ${domains[0]} (${example}).`
  }
  if (parsed.pathname === '/' || parsed.pathname === '') {
    return `That is the ${label} front page, not a post: paste the path to the post itself.`
  }
  return null
}
