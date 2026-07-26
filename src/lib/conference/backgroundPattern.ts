/**
 * The decorative page-background pattern switch (go-live gate G2, #643, E1).
 *
 * The default `'cloud-native'` renders the animated CNCF ecosystem logos (the
 * historical behaviour). `'subtle'` renders the same pattern far sparser and
 * fainter; `'none'` renders only the plain gradient with no logos. ABSENT is
 * normalized to `'cloud-native'`, so legacy conferences are unaffected.
 */
export const BACKGROUND_PATTERN_VALUES = [
  'cloud-native',
  'subtle',
  'none',
] as const

export type BackgroundPattern = (typeof BACKGROUND_PATTERN_VALUES)[number]

export const DEFAULT_BACKGROUND_PATTERN: BackgroundPattern = 'cloud-native'

/** Coerce any stored/absent value to a known pattern (absent → default). */
export function normalizeBackgroundPattern(
  value: string | null | undefined,
): BackgroundPattern {
  return BACKGROUND_PATTERN_VALUES.includes(value as BackgroundPattern)
    ? (value as BackgroundPattern)
    : DEFAULT_BACKGROUND_PATTERN
}
