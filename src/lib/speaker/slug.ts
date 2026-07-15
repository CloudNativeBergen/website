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

/**
 * True when `slug` is already in the canonical shape produced by
 * {@link generateSpeakerSlug}: a non-empty, lowercase, `[a-z0-9-]` string with
 * no leading/trailing/doubled dashes and within {@link MAX_SLUG_LENGTH}.
 *
 * Implemented as a fixed-point check against {@link slugifyBase}: a slug is
 * canonical iff slugifying it is a no-op. This is the single source of truth
 * for "is this slug URL-safe?" used by the repair migration to decide whether a
 * stored slug must be regenerated. A valid, unique slug that passes this check
 * is never rewritten (preserving existing profile URLs / SEO).
 */
export function isCanonicalSpeakerSlug(slug: unknown): slug is string {
  if (typeof slug !== 'string') return false
  if (slug.length === 0 || slug.length > MAX_SLUG_LENGTH) return false
  return slug === slugifyBase(slug)
}

/** Input for {@link resolveSpeakerSlugs}: one speaker document to slug. */
export interface SpeakerSlugInput {
  /** Document id. */
  id: string
  /** Display name (used to derive a slug when the current one is unusable). */
  name?: string | null
  /**
   * The speaker's current slug string (the `slug.current` value, or the raw
   * value if the slug was stored as a legacy string). Missing/empty/invalid
   * values are replaced; a valid unique value is preserved verbatim.
   */
  currentSlug?: string | null
  /** Number of inbound references — the primary "most established" signal. */
  referenceCount?: number
  /** `_createdAt` ISO string — the tiebreak when reference counts are equal. */
  createdAt?: string | null
}

/** Result for one speaker from {@link resolveSpeakerSlugs}. */
export interface SpeakerSlugAssignment {
  id: string
  /** The final, canonical, dataset-unique slug this speaker should have. */
  slug: string
  /**
   * True when {@link slug} differs from a valid current slug (i.e. the slug was
   * missing, non-canonical, or lost a collision). False only when the speaker
   * already had this exact canonical slug — callers may still need to rewrite a
   * string-shaped slug into the `{_type:'slug'}` object even when `false`.
   */
  changed: boolean
}

/**
 * Order two speakers by how "established" they are, most-established first.
 * Priority: most inbound references, then oldest `_createdAt`, then lowest id
 * (a stable, deterministic final tiebreak). A missing `_createdAt` sorts as the
 * newest (least established) value.
 */
function compareEstablished(a: SpeakerSlugInput, b: SpeakerSlugInput): number {
  const refsA = a.referenceCount ?? 0
  const refsB = b.referenceCount ?? 0
  if (refsA !== refsB) return refsB - refsA

  // `~` (0x7E) sorts after every ISO-8601 timestamp character, so an absent
  // createdAt is treated as the newest possible date.
  const createdA = a.createdAt ?? '~'
  const createdB = b.createdAt ?? '~'
  if (createdA !== createdB) return createdA < createdB ? -1 : 1

  return a.id < b.id ? -1 : 1
}

/**
 * Compute the dataset-wide slug assignment for every speaker, resolving
 * collisions deterministically. This is the pure core of the slug-repair
 * migration (Part A) — it performs no I/O so it is fully unit-testable.
 *
 * Rules:
 * - A speaker whose `currentSlug` is already canonical ({@link
 *   isCanonicalSpeakerSlug}) keeps it as its desired slug; otherwise a fresh
 *   base is derived from its name via {@link generateSpeakerSlug} (which falls
 *   back to `"speaker"` for empty/emoji/non-Latin names).
 * - When several speakers want the same slug, the most established one (see
 *   {@link compareEstablished}) keeps it; the rest are re-slugged with the
 *   smallest free numeric suffix (`-2`, `-3`, …) that does not collide with any
 *   other assignment.
 * - A speaker that already holds a canonical slug with no contenders is left
 *   untouched (`changed: false`), preserving its public URL.
 */
export function resolveSpeakerSlugs(
  inputs: SpeakerSlugInput[],
): SpeakerSlugAssignment[] {
  // 1. Desired base slug per doc: keep a canonical current slug, else derive
  //    from the name.
  const desiredBase = new Map<string, string>()
  for (const input of inputs) {
    const current = input.currentSlug ?? ''
    const base = isCanonicalSpeakerSlug(current)
      ? current
      : generateSpeakerSlug(input.name ?? '')
    desiredBase.set(input.id, base)
  }

  // 2. Group docs that want the same base slug.
  const groups = new Map<string, SpeakerSlugInput[]>()
  for (const input of inputs) {
    const base = desiredBase.get(input.id) as string
    const group = groups.get(base)
    if (group) {
      group.push(input)
    } else {
      groups.set(base, [input])
    }
  }

  // 3. Winner of each group keeps the base slug; reserve every winner slug
  //    before assigning any suffixes so a re-slug can never land on a slug a
  //    different group's winner is keeping.
  const used = new Set<string>()
  const finalById = new Map<string, string>()
  const losers: SpeakerSlugInput[] = []

  for (const [base, members] of groups) {
    const sorted = [...members].sort(compareEstablished)
    const [winner, ...rest] = sorted
    finalById.set(winner.id, base)
    used.add(base)
    losers.push(...rest)
  }

  // 4. Assign suffixed slugs to the losers in a deterministic order.
  losers.sort((a, b) => {
    const baseA = desiredBase.get(a.id) as string
    const baseB = desiredBase.get(b.id) as string
    if (baseA !== baseB) return baseA < baseB ? -1 : 1
    return compareEstablished(a, b)
  })

  for (const loser of losers) {
    const base = desiredBase.get(loser.id) as string
    let suffix = 2
    let candidate = generateSpeakerSlug(base, suffix)
    while (used.has(candidate)) {
      suffix += 1
      candidate = generateSpeakerSlug(base, suffix)
    }
    used.add(candidate)
    finalById.set(loser.id, candidate)
  }

  // 5. Emit assignments in the original input order.
  return inputs.map((input) => {
    const slug = finalById.get(input.id) as string
    const current = input.currentSlug ?? ''
    const changed = !(isCanonicalSpeakerSlug(current) && current === slug)
    return { id: input.id, slug, changed }
  })
}
