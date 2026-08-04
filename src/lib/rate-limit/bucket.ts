import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { groq } from 'next-sanity'

/**
 * The platform's ONE rate-limiting primitive: a rolling-window hit counter
 * stored as a single Sanity document per subject.
 *
 * Extracted from the email sign-in limiter (`@/lib/auth/email-link/rateLimit`)
 * when the machine provisioning API needed the same guarantees — the algorithm
 * below is that limiter's, unchanged, with the document type, bucket id and
 * failure directions lifted into parameters.
 *
 * WHY SANITY AND NOT MEMORY: this deployment is serverless; an in-process
 * counter is per-instance and therefore not a limit at all. Sanity is the only
 * durable store the platform already owns, and adding a counter vendor would
 * add a subprocessor for a feature whose whole point is costing nothing.
 *
 * WHAT IS AT REST: the caller passes an ALREADY-HASHED bucket id, so no address,
 * IP or token ever reaches the content lake — only the scope label and the hit
 * timestamps.
 *
 * CONCURRENCY: the check is read-modify-write, and the write is a
 * REVISION-CONDITIONED COMPARE-AND-SWAP — the same primitive `email-link/store`
 * uses for single-use token consumption. A plain `createOrReplace` here would be
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

/** Bounded CAS retries. Contention on a single subject's bucket is rare. */
const MAX_ATTEMPTS = 4

interface RateDoc {
  _id: string
  _rev: string
  hits?: number[]
}

// groq-global: platform-internal abuse counters, deliberately not tenant-scoped
const FETCH_BUCKET = groq`*[_type == $type && _id == $id][0]{ _id, _rev, hits }`

export interface RateLimitRule {
  readonly windowSeconds: number
  readonly max: number
}

export interface HitBucketParams {
  /** Sanity document type owning this counter family. */
  type: string
  /** Pre-hashed, deterministic document id for the subject. */
  id: string
  /** Human-readable counter family, stored for operator triage. */
  scope: string
  rules: readonly RateLimitRule[]
  now: number
  /** Log prefix, e.g. `[provisioning]`. */
  label: string
  /**
   * What a READ failure means. `'allow'` for limiters that guard a convenience
   * (a store outage must not lock everybody out of sign-in); `'deny'` for
   * limiters in front of a privileged write, where refusing a rare admin
   * operation during an outage costs nothing.
   *
   * A WRITE failure always denies: a bucket whose hits are never persisted is
   * not a limit, it is an unbounded cannon that needs no concurrency at all.
   */
  onReadFailure: 'allow' | 'deny'
}

/** Record a hit against one bucket and report whether it was allowed. */
export async function hitRateLimitBucket({
  type,
  id,
  scope,
  rules,
  now,
  label,
  onReadFailure,
}: HitBucketParams): Promise<boolean> {
  const longestWindowMs =
    Math.max(...rules.map((rule) => rule.windowSeconds)) * 1000
  const keep = Math.max(...rules.map((rule) => rule.max)) * 2

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let doc: RateDoc | null
    try {
      doc = await clientReadUncached.fetch<RateDoc | null>(
        FETCH_BUCKET,
        { type, id },
        { cache: 'no-store' },
      )
    } catch (error) {
      console.error(`${label} rate-limit read failed (${scope})`, error)
      return onReadFailure === 'allow'
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
          _type: type,
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
        console.error(`${label} rate-limit write failed (${scope})`, error)
      }
    }
  }

  return false
}

/** Delete buckets of one type whose longest window has fully elapsed. */
export async function deleteExpiredRateLimitBuckets(
  type: string,
  label: string,
  now: number = Date.now(),
): Promise<{ deleted: number }> {
  try {
    const result = await clientWrite.delete({
      // groq-global: platform-internal abuse counter, deliberately not tenant-scoped
      query: groq`*[_type == $type && expiresAt < $now]`,
      params: { type, now: new Date(now).toISOString() },
    })
    return { deleted: result?.results?.length ?? 0 }
  } catch (error) {
    console.error(`${label} failed to clean up rate-limit buckets`, error)
    return { deleted: 0 }
  }
}
