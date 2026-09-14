/**
 * Copy-skeleton placeholders (spec §5.2). Conference placeholders resolve at
 * seeding; subject placeholders resolve when a Task has a subject (Trigger
 * and expansion Tasks, later tickets).
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

export const PLACEHOLDERS = [
  ...CONFERENCE_PLACEHOLDERS,
  ...SUBJECT_PLACEHOLDERS,
] as const

export type Placeholder = (typeof PLACEHOLDERS)[number]
export type ConferencePlaceholder = (typeof CONFERENCE_PLACEHOLDERS)[number]

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
