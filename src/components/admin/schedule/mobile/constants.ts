// Shared constants for the mobile schedule editor: tap-target + button styles
// and the rail geometry tuning. Pure values, no React — safe to import anywhere
// in the `mobile/` subtree (and unit-testable).

export const TAP_TARGET = 'min-h-[44px]'

export const PRIMARY_BUTTON =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600'

export const SECONDARY_BUTTON =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'

// Rail geometry (see railGeometry.ts). Card heights are content-driven with a
// small floor; duration adds only a GENTLE, hard-capped proportional nudge so a
// long workshop reads slightly taller without producing a bulky, mostly-empty
// card that dominates the panel and fights the swipe. The duration CHIP carries
// the exact length.
export const PX_PER_MIN = 0.55
export const SEG_MIN_HEIGHT = 56
export const SEG_MAX_HEIGHT = 112
export const OPEN_MAX_HEIGHT = 72
// Open gaps shorter than this can't hold a talk, so they render as a slim,
// non-interactive divider rather than an "assign here" target.
export const MIN_OPEN_SLOT_MIN = 10
// Left time gutter width (~52px) — the rail line sits at its right edge.
export const GUTTER_PX = 52
