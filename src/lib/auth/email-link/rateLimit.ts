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
 * CONCURRENCY: the check is read-modify-write, and the write is a
 * REVISION-CONDITIONED COMPARE-AND-SWAP — the same primitive `store.ts` uses for
 * single-use token consumption. A plain `createOrReplace` here would be
 * last-write-wins over a whole array, which does not merely overshoot the cap:
 * N concurrent requests would each read `hits: []` and each write `hits: [now]`,
 * so a burst of N would leave the bucket believing ONE request happened and the
 * caps would never accumulate at all. With the CAS, exactly one writer wins per
 * round; the losers re-read (seeing the winner's hit) and re-evaluate, so a
 * concurrent burst is enforced to the configured cap rather than to a multiple
 * of it. A request that cannot land its write within {@link MAX_ATTEMPTS} rounds
 * is DENIED — under contention that is the safe direction, and it is the only
 * reason denial can happen without the caps being exceeded.
 */

/** Bounded CAS retries. Contention on a per-address bucket is rare in real use. */
const MAX_ATTEMPTS = 4

interface RateDoc {
  _id: string
  _rev: string
  hits?: number[]
}

// groq-global: platform-internal abuse counter, deliberately not tenant-scoped
const FETCH_BUCKET = groq`*[_type == $type && _id == $id][0]{ _id, _rev, hits }`

interface Rule {
  readonly windowSeconds: number
  readonly max: number
}

/**
 * Record a hit against one bucket and report whether it was allowed.
 *
 * FAIL-OPEN ON READ FAILURE, deliberately: this limiter guards a convenience
 * (how often a link may be requested), and a Sanity outage must not make
 * sign-in impossible for everybody. The controls that must fail CLOSED — token
 * verification, single use, origin binding — are elsewhere and do.
 *
 * FAIL-CLOSED ON WRITE FAILURE, equally deliberately: a bucket whose hits are
 * never persisted is not a limit, it is an unbounded mail cannon that needs no
 * concurrency at all. So a write that does not land denies the request. The
 * asymmetry is the point — a read outage costs nothing to an attacker (the cap
 * is simply absent either way), a write outage would hand them the whole
 * mailbox.
 */
async function hitBucket(
  scope: 'email' | 'ip',
  subject: string,
  rules: readonly Rule[],
  now: number,
): Promise<boolean> {
  const longestWindowMs =
    Math.max(...rules.map((rule) => rule.windowSeconds)) * 1000
  const keep = Math.max(...rules.map((rule) => rule.max)) * 2
  let id: string
  try {
    id = rateLimitKey(scope, subject)
  } catch {
    // AUTH_SECRET missing — the caller cannot mint a token either.
    return false
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let doc: RateDoc | null
    try {
      doc = await clientReadUncached.fetch<RateDoc | null>(
        FETCH_BUCKET,
        { type: EMAIL_SIGN_IN_RATE_LIMIT_TYPE, id },
        { cache: 'no-store' },
      )
    } catch (error) {
      console.error(`[email-link] rate-limit read failed (${scope})`, error)
      return true
    }

    const hits = (doc?.hits ?? []).filter(
      (at) => typeof at === 'number' && at > now - longestWindowMs,
    )

    for (const rule of rules) {
      const since = now - rule.windowSeconds * 1000
      if (hits.filter((at) => at > since).length >= rule.max) {
        // Over a cap: DENY without charging, so a denied attempt cannot keep
        // the window topped up and turn a burst into a permanent lockout.
        return false
      }
    }

    const next = [...hits, now].slice(-keep)
    const expiresAt = new Date(now + longestWindowMs).toISOString()
    try {
      if (!doc?._id) {
        // `create` on an explicit id is itself a compare-and-swap: it fails if
        // the document already exists, which is the concurrent-creation case.
        await clientWrite.create({
          _id: id,
          _type: EMAIL_SIGN_IN_RATE_LIMIT_TYPE,
          scope,
          hits: next,
          expiresAt,
        })
      } else {
        await clientWrite
          .patch(doc._id)
          .ifRevisionId(doc._rev)
          .set({ scope, hits: next, expiresAt })
          .commit({ visibility: 'sync' })
      }
      return true
    } catch (error) {
      // 409 (the revision moved, or the document was created concurrently) is
      // normal contention: re-read and re-evaluate against the winner's hit.
      // Any other write failure is retried the same way and, if it persists,
      // denies below.
      if (attempt === MAX_ATTEMPTS - 1) {
        console.error(`[email-link] rate-limit write failed (${scope})`, error)
      }
    }
  }

  return false
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
