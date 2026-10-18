import { z } from 'zod'
import { isValidDomainEntry, normalizeDomain } from '@/lib/conference/domains'
import {
  conferenceTag,
  domainTag,
  feedbackCodeIndexTag,
  organizationTag,
} from './tags'

/**
 * EXTERNAL CACHE INVALIDATION — the target vocabulary (RunKonf/platform#36).
 *
 * Two applications now write the same Sanity dataset. `RunKonf/kontroll` (the
 * control panel at my.konf.app) writes `organization` documents with its own
 * token, and this app caches exactly those fields: `getOrganizationById` is
 * `'use cache'` with `cacheLife('hours')` — revalidate 1h, EXPIRE 24h — over
 * `name`, `slug` and `contactEmail`. Until this module existed there was no way
 * for a writer outside this deployment to bust that entry, so an organizer who
 * renamed their organization in kontroll saw a success message and a conference
 * site that kept serving the old name for up to a day.
 *
 * WHAT THIS MODULE IS. A total function from a caller-supplied TARGET to one of
 * the tags `@/lib/cache/tags` already mints. It is the whole vocabulary the
 * external endpoint accepts, and it is deliberately small.
 *
 * WHAT IT IS NOT, AND MUST NEVER BECOME:
 *
 *  1. A BLANKET FLUSH. There is no `{"type":"all"}` and no way to name the
 *     broad `content:*` tags — those bust EVERY tenant at once, and an endpoint
 *     that exposes them hands any holder of the shared secret (or anyone who
 *     can make it retry) a cache-stampede primitive against the whole platform.
 *     Every target here busts exactly one document's or one host's entries.
 *  2. AN EXISTENCE ORACLE. Nothing in this module reads Sanity. A tag is a pure
 *     function of the caller's own input, so invalidating an organization that
 *     does not exist computes a tag nothing is stored under and revalidates
 *     nothing — a genuine no-op that returns the same 200 as a real hit, with
 *     nothing to compare against. There is no lookup to leak.
 *
 * EXTENDING IT. Add a member to the union and a `case` to {@link revalidationsForTarget}.
 * Do not widen an existing member to accept a tag NAME: the point of the union
 * is that the caller names a DOCUMENT and this app decides which tag that
 * implies, so the tag structure stays this repo's to change.
 */

/**
 * The most targets one request may carry. This — not the rate limiter — is the
 * bound on how much work a single accepted call can cause; the limiter bounds
 * how many such calls there may be. Comfortably above kontroll's real batch (it
 * writes one organization at a time), far below anything resembling a flush.
 */
export const MAX_INVALIDATION_TARGETS = 20

/**
 * A Sanity document id, by SHAPE only. Sanity ids are opaque; this rejects the
 * obviously-not-an-id (empty, unbounded, control characters, GROQ punctuation)
 * so a mangled caller gets a 400 instead of silently revalidating a nonsense
 * tag. It deliberately does NOT check existence — see the module doc.
 */
const SanityDocumentId = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._-]+$/)

/**
 * A hostname, normalized to the canonical stored form FIRST and then validated
 * with the same `isValidDomainEntry` the conference `domains[]` editor uses —
 * so the tag computed here is byte-identical to the one the cached read
 * registered for that host. A second, looser notion of "a domain" would produce
 * a tag that matches nothing, which is the silent-no-op failure mode this whole
 * feature exists to prevent.
 */
const DomainName = z
  .string()
  .transform(normalizeDomain)
  .refine(isValidDomainEntry)

export const InvalidationTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('organization'), id: SanityDocumentId }),
  z.object({ type: z.literal('conference'), id: SanityDocumentId }),
  z.object({ type: z.literal('domain'), domain: DomainName }),
])

export type InvalidationTarget = z.infer<typeof InvalidationTargetSchema>

export const InvalidationRequestSchema = z.object({
  targets: z
    .array(InvalidationTargetSchema)
    .min(1)
    .max(MAX_INVALIDATION_TARGETS),
})

/**
 * One tag to revalidate, and how: the `'default'` profile (stale-while-
 * revalidate), or `{ expire: 0 }` for a tag whose stale value must not be
 * served while it refreshes.
 */
export interface TagRevalidation {
  tag: string
  profile: 'default' | { expire: 0 }
}

/**
 * The tags a target implies. Every branch delegates to `@/lib/cache/tags` —
 * the tag strings are not restated here, because a second copy is exactly how
 * an invalidation quietly starts missing the read it is supposed to bust.
 *
 * A conference target also expires that conference's Feedback Code index
 * (speaker feedback spec §5.1): it is cached apart from `conferenceTag`, it
 * shows speaker names on the attendee page, and speaker erasure relies on this
 * target to clear them. Expired at once, as every other expiry of it is.
 */
export function revalidationsForTarget(
  target: InvalidationTarget,
): TagRevalidation[] {
  switch (target.type) {
    case 'organization':
      return [{ tag: organizationTag(target.id), profile: 'default' }]
    case 'conference':
      return [
        { tag: conferenceTag(target.id), profile: 'default' },
        { tag: feedbackCodeIndexTag(target.id), profile: { expire: 0 } },
      ]
    case 'domain':
      return [{ tag: domainTag(target.domain), profile: 'default' }]
  }
}

/**
 * The de-duplicated revalidations for a batch, in first-seen order. Duplicates
 * in the payload (kontroll patching the same org twice in one flush) must not
 * be charged twice against the platform's revalidation budget.
 */
export function revalidationsForTargets(
  targets: readonly InvalidationTarget[],
): TagRevalidation[] {
  const byTag = new Map<string, TagRevalidation>()
  for (const r of targets.flatMap(revalidationsForTarget)) {
    if (!byTag.has(r.tag)) byTag.set(r.tag, r)
  }
  return [...byTag.values()]
}
