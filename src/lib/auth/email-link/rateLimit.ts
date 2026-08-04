import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import {
  EMAIL_RATE_LIMIT_RULES,
  EMAIL_SIGN_IN_RATE_LIMIT_TYPE,
  IP_RATE_LIMIT_RULES,
} from './constants'
import { rateLimitKey } from './token'

/**
 * RATE LIMITING for email sign-in link requests, backed by Sanity.
 *
 * WHY SANITY AND NOT MEMORY: this deployment is serverless; an in-process
 * counter is per-instance and therefore not a limit at all. Sanity is the only
 * durable store the platform already owns, and adding a counter vendor would
 * add a subprocessor for a feature whose whole point is costing nothing.
 *
 * WHAT IS AT REST: a salted hash of the subject (as the document id), the
 * scope, and the hit timestamps. No address and no IP is ever written.
 *
 * KNOWN WEAKNESS, stated rather than hidden: the check is read-modify-write, so
 * two requests that interleave between the read and the write can both pass a
 * limit. The window is a single Sanity round-trip and the overshoot is bounded
 * by concurrency, so the worst case is a small multiple of the configured cap —
 * acceptable for an anti-abuse control, and NOT acceptable for anything that
 * gates authorization (which is why single-use enforcement uses a
 * revision-conditioned compare-and-swap instead, see `store.ts`).
 */

interface RateDoc {
  _id: string
  hits?: number[]
}

// groq-global: platform-internal abuse counter, deliberately not tenant-scoped
const FETCH_BUCKET = groq`*[_type == $type && _id == $id][0]{ _id, hits }`

interface Rule {
  readonly windowSeconds: number
  readonly max: number
}

/**
 * Record a hit against one bucket and report whether it was allowed.
 *
 * FAIL-OPEN ON STORE FAILURE, deliberately: this limiter guards a convenience
 * (how often a link may be requested), and a Sanity outage must not make
 * sign-in impossible for everybody. The controls that must fail CLOSED — token
 * verification, single use, origin binding — are elsewhere and do.
 */
async function hitBucket(
  scope: 'email' | 'ip',
  subject: string,
  rules: readonly Rule[],
  now: number,
): Promise<boolean> {
  const longestWindowMs =
    Math.max(...rules.map((rule) => rule.windowSeconds)) * 1000
  let id: string
  try {
    id = rateLimitKey(scope, subject)
  } catch {
    // AUTH_SECRET missing — the caller cannot mint a token either.
    return false
  }

  let hits: number[] = []
  try {
    const doc = await clientReadUncached.fetch<RateDoc | null>(
      FETCH_BUCKET,
      { type: EMAIL_SIGN_IN_RATE_LIMIT_TYPE, id },
      { cache: 'no-store' },
    )
    hits = (doc?.hits ?? []).filter(
      (at) => typeof at === 'number' && at > now - longestWindowMs,
    )
  } catch (error) {
    console.error(`[email-link] rate-limit read failed (${scope})`, error)
    return true
  }

  for (const rule of rules) {
    const since = now - rule.windowSeconds * 1000
    if (hits.filter((at) => at > since).length >= rule.max) {
      return false
    }
  }

  const next = [...hits, now].slice(-Math.max(...rules.map((r) => r.max)) * 2)
  try {
    await clientWrite.createOrReplace({
      _id: id,
      _type: EMAIL_SIGN_IN_RATE_LIMIT_TYPE,
      scope,
      hits: next,
      expiresAt: new Date(now + longestWindowMs).toISOString(),
    })
  } catch (error) {
    console.error(`[email-link] rate-limit write failed (${scope})`, error)
  }
  return true
}

/**
 * Apply BOTH the per-address and the per-IP limits.
 *
 * The address bucket is charged FIRST and, when it denies, the IP bucket is not
 * charged at all — otherwise one address hammering the endpoint would exhaust
 * the shared IP budget of everyone behind the same NAT.
 *
 * A missing/unparseable client IP charges only the address bucket. Trusting a
 * spoofable header to LOCK PEOPLE OUT would be the wrong failure direction; the
 * address limit is the one that actually protects a targeted mailbox.
 */
export async function checkEmailLinkRateLimit(params: {
  normalizedEmail: string
  clientIp?: string | null
  now?: number
}): Promise<{ allowed: boolean; scope?: 'email' | 'ip' }> {
  const now = params.now ?? Date.now()

  if (
    !(await hitBucket(
      'email',
      params.normalizedEmail,
      EMAIL_RATE_LIMIT_RULES,
      now,
    ))
  ) {
    return { allowed: false, scope: 'email' }
  }

  const ip = params.clientIp?.trim()
  if (ip) {
    if (!(await hitBucket('ip', ip, IP_RATE_LIMIT_RULES, now))) {
      return { allowed: false, scope: 'ip' }
    }
  }

  return { allowed: true }
}

/** Delete rate-limit buckets whose longest window has fully elapsed. */
export async function deleteExpiredEmailSignInRateLimits(
  now: number = Date.now(),
): Promise<{ deleted: number }> {
  try {
    const result = await clientWrite.delete({
      // groq-global: platform-internal abuse counter, deliberately not tenant-scoped
      query: groq`*[_type == $type && expiresAt < $now]`,
      params: {
        type: EMAIL_SIGN_IN_RATE_LIMIT_TYPE,
        now: new Date(now).toISOString(),
      },
    })
    return { deleted: result?.results?.length ?? 0 }
  } catch (error) {
    console.error('[email-link] failed to clean up rate-limit buckets', error)
    return { deleted: 0 }
  }
}

/**
 * The client IP for rate limiting, from the proxy chain.
 *
 * The LEFTMOST `x-forwarded-for` entry is the client as reported by Vercel's
 * edge; it is attacker-controllable in principle, which is exactly why an
 * unusable value degrades to "no IP bucket" rather than to a block.
 */
export function clientIpFromHeaders(headers: {
  get(name: string): string | null
}): string | undefined {
  const forwarded = headers.get('x-forwarded-for')
  const candidate = forwarded?.split(',')[0]?.trim()
  if (candidate) return candidate
  return headers.get('x-real-ip')?.trim() || undefined
}
