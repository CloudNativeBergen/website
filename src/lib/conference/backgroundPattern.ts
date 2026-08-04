/**
 * The decorative page-background pattern switch (go-live gate G2, #643, E1).
 *
 * `'cloud-native'` renders the animated CNCF ecosystem logos; `'subtle'`
 * renders the same pattern far sparser and fainter; `'none'` renders only the
 * plain gradient with no logos.
 *
 * ABSENT normalizes to `'none'`. It used to normalize to `'cloud-native'`,
 * which meant a conference that has nothing to do with the CNCF ecosystem got
 * a page background of Kubernetes, Helm and Prometheus logos on day one. The
 * CNCF field is now something a tenant opts INTO.
 *
 * ⚠️ MIGRATION 046 MUST HAVE RUN before this ships: it pins
 * `backgroundPattern: 'cloud-native'` onto the three existing Cloud Native Days
 * editions, which render that field today purely because it is absent.
 */
export const BACKGROUND_PATTERN_VALUES = [
  'cloud-native',
  'subtle',
  'none',
] as const

export type BackgroundPattern = (typeof BACKGROUND_PATTERN_VALUES)[number]

export const DEFAULT_BACKGROUND_PATTERN: BackgroundPattern = 'none'

/** Coerce any stored/absent value to a known pattern (absent → default). */
export function normalizeBackgroundPattern(
  value: string | null | undefined,
): BackgroundPattern {
  return BACKGROUND_PATTERN_VALUES.includes(value as BackgroundPattern)
    ? (value as BackgroundPattern)
    : DEFAULT_BACKGROUND_PATTERN
}
