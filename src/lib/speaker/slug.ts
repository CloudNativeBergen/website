/**
 * Canonical speaker slug generation.
 *
 * This is the single shared implementation used by every code path that
 * persists a speaker slug (OAuth create/link in `sanity.ts` and admin create in
 * the speaker router). It guarantees a URL-safe, lowercase, never-empty slug.
 */

/** Sanity `slug` field `maxLength` for speakers (see schema). */
export const MAX_SLUG_LENGTH = 96

/**
 * Stable fallback base used when a name reduces to an empty slug (e.g. an
 * emoji-only or non-Latin name). We never persist an empty slug.
 */
export const FALLBACK_SLUG_BASE = 'speaker'

/**
 * Reduce a name to a URL-safe lowercase slug base. Never empty: falls back to
 * {@link FALLBACK_SLUG_BASE} when the name contains no slug-safe characters.
 */
function slugifyBase(name: string): string {
  const base = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return base || FALLBACK_SLUG_BASE
}

/**
 * Generate a URL-safe lowercase slug for a speaker name. When `suffix` is
 * provided (for collision resolution) it is appended as `-<suffix>` and the
 * base is truncated so the result never exceeds {@link MAX_SLUG_LENGTH}.
 *
 * Never returns an empty string.
 */
export function generateSpeakerSlug(
  name: string,
  suffix?: number | string,
): string {
  const base = slugifyBase(name)

  if (suffix !== undefined && suffix !== '') {
    const suffixStr = String(suffix)
    const maxBaseLength = MAX_SLUG_LENGTH - 1 - suffixStr.length
    const truncatedBase = base.slice(0, Math.max(0, maxBaseLength))
    return `${truncatedBase}-${suffixStr}`
  }

  return base.slice(0, MAX_SLUG_LENGTH)
}

/** Async predicate: returns true when a candidate slug is already taken. */
export type SlugExistsChecker = (slug: string) => Promise<boolean>

/**
 * Hard cap on suffix probing to avoid an unbounded loop if the collision
 * checker misbehaves (e.g. always reports "taken"). Practically unreachable.
 */
const MAX_SLUG_ATTEMPTS = 1000

/**
 * Generate a unique slug for a name by probing numeric suffixes (`-2`, `-3`, …)
 * until `exists` reports the candidate is free. The first candidate has no
 * suffix. Falls back to a timestamp-suffixed slug if the cap is somehow hit.
 */
export async function generateUniqueSpeakerSlug(
  name: string,
  exists: SlugExistsChecker,
): Promise<string> {
  const first = generateSpeakerSlug(name)
  if (!(await exists(first))) {
    return first
  }

  for (let suffix = 2; suffix < MAX_SLUG_ATTEMPTS; suffix++) {
    const candidate = generateSpeakerSlug(name, suffix)
    if (!(await exists(candidate))) {
      return candidate
    }
  }

  // Extremely defensive fallback; should never be reached in practice.
  return generateSpeakerSlug(name, Date.now())
}
