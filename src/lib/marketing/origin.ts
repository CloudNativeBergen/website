/**
 * PLAN ORIGIN — pure. Where a Marketing Plan came from (Templates spec §2.3),
 * stored as text in `marketingPlan.templateVersion`: `blank`, the built-in
 * Template version, `copy:<sourcePlanId>`, or `template:<name>@<version>` for an
 * organization Template. Text rather than a reference, so
 * the source can disappear without leaving the plan a dangling origin.
 */

export const BLANK_ORIGIN = 'blank'
const COPY_PREFIX = 'copy:'
/** Prefixed, so a Template called `blank` or `2027.1` is still a Template. */
const TEMPLATE_PREFIX = 'template:'
/** A built-in Template version: `2026.1`. */
const BUILTIN_VERSION = /^\d+(\.\d+)*$/

export type PlanOrigin =
  | { type: 'blank' }
  | { type: 'builtin'; version: string }
  | { type: 'copy'; planId: string }
  /** Name and version as stamped at seed time; the Template may be gone. */
  | { type: 'template'; name: string; version: number }
  /** Nothing stored, or text this build cannot read: never guess a source. */
  | { type: 'unknown' }

export function copyTemplateVersion(sourcePlanId: string): string {
  return `${COPY_PREFIX}${sourcePlanId}`
}

export function templateOrigin(name: string, version: number): string {
  return `${TEMPLATE_PREFIX}${name}@${version}`
}

/** The version follows the LAST `@`: a Template name may contain one. */
function templateStamp(stamp: string): PlanOrigin {
  const at = stamp.lastIndexOf('@')
  const name = stamp.slice(0, at)
  const version = Number(stamp.slice(at + 1))
  return at > 0 && Number.isInteger(version) && version > 0
    ? { type: 'template', name, version }
    : { type: 'unknown' }
}

export function planOrigin(stored: string | null | undefined): PlanOrigin {
  if (!stored) return { type: 'unknown' }
  if (stored === BLANK_ORIGIN) return { type: 'blank' }
  if (stored.startsWith(COPY_PREFIX))
    return { type: 'copy', planId: stored.slice(COPY_PREFIX.length) }
  if (stored.startsWith(TEMPLATE_PREFIX))
    return templateStamp(stored.slice(TEMPLATE_PREFIX.length))
  if (BUILTIN_VERSION.test(stored)) return { type: 'builtin', version: stored }
  return { type: 'unknown' }
}

/** The one-line provenance, or null when the origin is unknown. */
export function originLabel(
  stored: string | null | undefined,
  copiedFromTitle?: string | null,
): string | null {
  const origin = planOrigin(stored)
  switch (origin.type) {
    case 'blank':
      return 'Started blank'
    case 'builtin':
      return `Built-in Template ${origin.version}`
    case 'copy':
      return copiedFromTitle
        ? `Copied from ${copiedFromTitle}`
        : 'Copied from a previous edition'
    case 'template':
      return `Template “${origin.name}”, version ${origin.version}`
    case 'unknown':
      return null
  }
}

/** Plan settings: how the Campaign structure relates to the plan's origin. */
export function originStructureSentence(
  stored: string | null | undefined,
  structurallyEdited: boolean,
): string {
  switch (planOrigin(stored).type) {
    case 'blank':
      return structurallyEdited
        ? 'This plan was started blank; everything in it has been added since.'
        : 'This plan was started blank and nothing has been added yet.'
    case 'builtin':
      return structurallyEdited
        ? 'Campaigns or Tasks have been added, edited or removed since seeding, so the Template version above describes the seed rather than this plan.'
        : 'Campaign structure still matches the built-in Template it was seeded from.'
    case 'template':
      return structurallyEdited
        ? 'Campaigns or Tasks have been added, edited or removed since seeding, so the Template version above describes the seed rather than this plan.'
        : 'Campaign structure still matches the Template it was seeded from.'
    case 'copy':
      return structurallyEdited
        ? 'Campaigns or Tasks have been added, edited or removed since copying, so this plan no longer matches the edition it was copied from.'
        : 'Campaign structure still matches the plan it was copied from.'
    case 'unknown':
      return structurallyEdited
        ? 'Campaigns or Tasks have been added, edited or removed since this plan was created.'
        : 'Campaign structure is unchanged since this plan was created.'
  }
}
