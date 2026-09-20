/**
 * PLAN ORIGIN — pure. Where a Marketing Plan came from (Templates spec §2.3),
 * stored as text in `marketingPlan.templateVersion`: `blank`, the built-in
 * Template version, or `copy:<sourcePlanId>`. Text rather than a reference, so
 * the source can disappear without leaving the plan a dangling origin.
 */

export const BLANK_ORIGIN = 'blank'
const COPY_PREFIX = 'copy:'
/** A built-in Template version: `2026.1`. */
const BUILTIN_VERSION = /^\d+(\.\d+)*$/

export type PlanOrigin =
  | { type: 'blank' }
  | { type: 'builtin'; version: string }
  | { type: 'copy'; planId: string }
  /** Nothing stored, or text this build cannot read: never guess a source. */
  | { type: 'unknown' }

export function copyTemplateVersion(sourcePlanId: string): string {
  return `${COPY_PREFIX}${sourcePlanId}`
}

export function planOrigin(stored: string | null | undefined): PlanOrigin {
  if (!stored) return { type: 'unknown' }
  if (stored === BLANK_ORIGIN) return { type: 'blank' }
  if (stored.startsWith(COPY_PREFIX))
    return { type: 'copy', planId: stored.slice(COPY_PREFIX.length) }
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
