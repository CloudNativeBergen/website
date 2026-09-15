/**
 * Copy-skeleton placeholders (spec §5.2). Conference placeholders resolve at
 * seeding; subject placeholders resolve when a Task has a subject (Trigger
 * and expansion Tasks, `generation.ts`). `{hook}` has no source: it stays
 * verbatim for the organizer, and scheduling refuses a body that still
 * carries a placeholder (`unresolvedPlaceholders`).
 */

export const CONFERENCE_PLACEHOLDERS = [
  'event',
  'date',
  'venue',
  'city',
  'url',
  'eventTag',
] as const

export const SUBJECT_PLACEHOLDERS = [
  'name',
  'company',
  'title',
  'hook',
  'tier',
] as const

/** Filled in per Task by the recurring expansion (the countdown's day count). */
export const EXPANSION_PLACEHOLDERS = ['days'] as const

export const PLACEHOLDERS = [
  ...CONFERENCE_PLACEHOLDERS,
  ...SUBJECT_PLACEHOLDERS,
  ...EXPANSION_PLACEHOLDERS,
] as const

export type Placeholder = (typeof PLACEHOLDERS)[number]

const PLACEHOLDER_RE = /\{([a-zA-Z]+)\}/g

/** Every `{name}` token in a skeleton, in order of appearance, deduplicated. */
export function placeholdersIn(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(PLACEHOLDER_RE)) found.add(match[1])
  return [...found]
}

/**
 * Replace every placeholder that has a value; unknown or missing ones are left
 * verbatim so a subject placeholder survives seeding for the later resolver.
 */
export function resolvePlaceholders(
  text: string,
  values: Partial<Record<Placeholder, string>>,
): string {
  return text.replace(PLACEHOLDER_RE, (token, name: string) => {
    const value = (values as Record<string, string | undefined>)[name]
    return value === undefined ? token : value
  })
}

/**
 * `#CloudNativeBergen2027` from "Cloud Native Bergen 2027": Bluesky tags are
 * exact-match strings, so one canonical casing derived from the title.
 */
export function eventTagFor(title: string): string {
  const stripped = title.replace(/[^\p{L}\p{N}]+/gu, '')
  return stripped ? `#${stripped}` : ''
}

/**
 * The known placeholder tokens still present in a text. Unknown `{words}`
 * are prose, not placeholders, and are not reported.
 */
export function unresolvedPlaceholders(text: string): Placeholder[] {
  return placeholdersIn(text).filter((name): name is Placeholder =>
    (PLACEHOLDERS as readonly string[]).includes(name),
  )
}
