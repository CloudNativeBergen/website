import { randomBytes } from 'crypto'
import { canonicalEmail, normalizeEmail } from '@/lib/speaker/email'
import { isServedTenantHost } from './audience'
import {
  EMAIL_LINK_CALLBACK_PATH,
  STATELESS_TOKEN_TTL_SECONDS,
  STORED_TOKEN_TTL_SECONDS,
} from './constants'
import { emailLinkIntentValue } from './intent'
import { canonicalHost, requestOrigin, safeCallbackPath } from './origin'
import { checkEmailLinkRateLimit, clientIpFromHeaders } from './rateLimit'
import { createStoredToken } from './store'
import { resolveEmailLinkTier } from './tier'
import { mintStatelessToken, mintStoredToken } from './token'

/**
 * REQUESTING a sign-in link.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO EMAIL ENUMERATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Every branch of this function returns the SAME value. Unknown address, known
 * speaker, known organizer, rate-limited, Resend rejection, Sanity outage — the
 * caller cannot tell them apart, and neither can the browser: the caller
 * redirects to one fixed "check your email" page regardless.
 *
 * The one signal this design cannot erase is TIMING (an organizer costs an
 * extra Sanity write). It is not amplified deliberately, and the round-trip is
 * dominated by the Resend call in every case; a timing oracle here would also
 * require the attacker to already know the address they are testing, which is
 * the thing enumeration is trying to discover. Stated, not defended.
 *
 * A missing conference/tenant is NOT a reason to refuse: the link's origin comes
 * from the request host, not from the conference, so sign-in keeps working on a
 * host whose conference lookup is degraded.
 */

export interface EmailLinkRequestOutcome {
  /** Always `true`. Present so call sites read as intentional, not accidental. */
  uniform: true
  /**
   * The value to store in the SAME-BROWSER INTENT COOKIE (see
   * `intent.ts`). It is the token's at-rest hash when a link was minted, and an
   * unrelated random value on every other branch.
   *
   * UNIFORMITY: the caller sets the cookie unconditionally, so its presence
   * never distinguishes "mail sent" from "rate-limited", "unknown address" or
   * "malformed". Only a browser that requested THIS token holds a matching
   * value, and only that browser skips the confirmation interstitial.
   */
  intent: string
}

function uniform(intent?: string): EmailLinkRequestOutcome {
  return { uniform: true, intent: intent ?? randomBytes(32).toString('hex') }
}

export interface RequestEmailSignInLinkDeps {
  /** Injected so the request path is testable without a live Sanity/Resend. */
  send: (args: {
    to: string
    signInUrl: string
    expiresInMinutes: number
    singleUse: boolean
  }) => Promise<boolean>
}

/**
 * Basic address sanity. Deliberately permissive — a real validity judgement is
 * delivery, and rejecting exotic-but-valid addresses would lock people out.
 * What it MUST reject is anything that could smuggle a second recipient or a
 * header into the Resend call.
 */
export function isPlausibleEmail(value: string): boolean {
  if (!value || value.length > 254) return false
  if (/[\s,;<>"\\]/.test(value)) return false
  const parts = value.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts
  if (!local || !domain) return false
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    return false
  }
  return true
}

export async function requestEmailSignInLink(
  params: {
    email: string
    headers: { get(name: string): string | null }
    callbackUrl?: string | null
    now?: number
  },
  deps: RequestEmailSignInLinkDeps,
): Promise<EmailLinkRequestOutcome> {
  const now = params.now ?? Date.now()

  // NFKC + trim + lowercase — the SAME normalization the speaker match-set uses,
  // so the address that is rate-limited, tokenized and later matched are one and
  // the same string.
  const normalized = normalizeEmail(params.email)
  if (!isPlausibleEmail(normalized)) return uniform()

  // THE ADDRESS WE VERIFY MUST BE THE ADDRESS WE MAIL. `normalizeEmail` applies
  // NFKC, `canonicalEmail` does not, so a typed address carrying compatibility
  // codepoints (`oﬃce@x.com`, `ｖictim@x.com`) would be MINTED and later written
  // into `knownEmails` in its folded form while the mail — and therefore the only
  // proof of ownership — went to the unfolded mailbox. `src/lib/speaker/email.ts`
  // states that NFKC widening is safe because only provider-VERIFIED, ASCII
  // addresses reach it; this is the first user-typed input on that path, so the
  // premise is restored here by refusing any address where the two forms differ.
  // Rejecting (rather than mailing the folded form) keeps the failure closed.
  if (normalized !== canonicalEmail(params.email)) return uniform()

  const origin = requestOrigin(params.headers)
  const host = canonicalHost(origin)
  if (!origin || !host) {
    console.error('[email-link] request has no usable host; refusing to mint')
    return uniform()
  }

  // AUDIENCE ALLOWLIST. The host above comes from `x-forwarded-host` and is
  // attacker-influenceable; minting a token whose audience is a host the
  // platform does not serve would make the redemption-time audience check a
  // tautology. See `audience.ts`.
  if (!(await isServedTenantHost(host))) {
    console.warn(
      '[email-link] request host is not a served tenant; not minting',
    )
    return uniform()
  }

  const rate = await checkEmailLinkRateLimit({
    normalizedEmail: normalized,
    clientIp: clientIpFromHeaders(params.headers),
    now,
  })
  if (!rate.allowed) {
    // Log the SCOPE only — never the address or the IP.
    console.warn(`[email-link] rate limit hit (${rate.scope}); no mail sent`)
    return uniform()
  }

  const tier = await resolveEmailLinkTier(normalized)

  let rawToken: string
  let ttlSeconds: number
  if (tier === 'stored') {
    ttlSeconds = STORED_TOKEN_TTL_SECONDS
    rawToken = mintStoredToken()
    const persisted = await createStoredToken({
      identifier: normalized,
      rawToken,
      origin: host,
      expiresAt: new Date(now + ttlSeconds * 1000),
    })
    // FAIL CLOSED: if the token could not be persisted it can never be
    // redeemed, so sending the mail would only produce a broken link.
    if (!persisted.ok) return uniform()
  } else {
    ttlSeconds = STATELESS_TOKEN_TTL_SECONDS
    try {
      rawToken = mintStatelessToken(normalized, host, ttlSeconds, now)
    } catch (error) {
      console.error('[email-link] could not mint a token', error)
      return uniform()
    }
  }

  const url = new URL(EMAIL_LINK_CALLBACK_PATH, origin)
  url.searchParams.set('token', rawToken)
  const callbackPath = safeCallbackPath(params.callbackUrl)
  if (callbackPath !== '/') url.searchParams.set('callbackUrl', callbackPath)

  // RECIPIENT vs MATCH KEY: `normalizeEmail` applies NFKC and is the MATCH key
  // (token identifier, rate-limit subject, `knownEmails`); `canonicalEmail` is
  // the DELIVERABLE form. Mixing them up can route mail carrying a bearer token
  // to a different mailbox — see the module comment in `src/lib/speaker/email.ts`.
  await deps.send({
    to: canonicalEmail(params.email),
    signInUrl: url.toString(),
    expiresInMinutes: Math.round(ttlSeconds / 60),
    singleUse: tier === 'stored',
  })

  return uniform(emailLinkIntentValue(rawToken))
}
