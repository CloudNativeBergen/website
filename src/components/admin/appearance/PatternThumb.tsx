'use client'

import { CloudNativePattern } from '@/components/CloudNativePattern'
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRIMARY_COLOR,
  isHexColor,
} from '@/lib/branding/theme'
import type { BackgroundPattern } from '@/lib/conference/backgroundPattern'

/**
 * A small STATIC render of one background-pattern option — the actual public
 * background (brand gradient wash + the same CNCF logo layer), not a sentence
 * naming it.
 *
 * Two deliberate differences from `BackgroundImage`:
 *
 * 1. `animated={false}` and a fixed `seed`. In a 3-up admin tile motion is noise
 *    and a `prefers-reduced-motion` liability, and a rotating seed would make
 *    every visit (and every visual-regression capture) different.
 * 2. Density and opacity are scaled UP for the tile. At ~80px tall the
 *    production values (opacity 0.10/0.04 over a full viewport) are literally
 *    invisible, which would show three identical empty tiles — the exact
 *    failure this component exists to fix. The ORDERING is what has to stay
 *    true: `subtle` is visibly sparser and fainter than `cloud-native`, and
 *    `none` has no logos at all.
 */

/** Tile-scale settings per pattern; `none` has no logo layer at all. */
const THUMB_SETTINGS: Record<
  Exclude<BackgroundPattern, 'none'>,
  { opacity: number; iconCount: number }
> = {
  'cloud-native': { opacity: 0.55, iconCount: 18 },
  subtle: { opacity: 0.3, iconCount: 8 },
}

/** Fixed so a tile renders identically on every visit and in every capture. */
const THUMB_SEED = 20260728

export function PatternThumb({
  pattern,
  primaryColor,
  accentColor,
  className = 'h-20',
}: {
  pattern: BackgroundPattern
  /** The tenant palette — the wash is the conference's own gradient. */
  primaryColor?: string | null
  accentColor?: string | null
  className?: string
}) {
  const settings = pattern === 'none' ? null : THUMB_SETTINGS[pattern]
  const p = isHexColor(primaryColor) ? primaryColor : DEFAULT_PRIMARY_COLOR
  const a = isHexColor(accentColor) ? accentColor : DEFAULT_ACCENT_COLOR

  return (
    <div
      aria-hidden="true"
      className={`relative w-full overflow-hidden rounded-md bg-white ring-1 ring-gray-900/10 dark:bg-gray-950 dark:ring-white/10 ${className}`}
    >
      {/* The same wash the public page paints under the logo layer. */}
      <div
        className="absolute inset-0 opacity-25"
        style={{ backgroundImage: `linear-gradient(135deg, ${p}, ${a})` }}
      />
      {settings ? (
        <>
          <div className="block dark:hidden">
            <CloudNativePattern
              variant="light"
              opacity={settings.opacity}
              animated={false}
              baseSize={26}
              iconCount={settings.iconCount}
              className="size-full"
              seed={THUMB_SEED}
            />
          </div>
          <div className="hidden dark:block">
            <CloudNativePattern
              variant="dark"
              opacity={settings.opacity}
              animated={false}
              baseSize={26}
              iconCount={settings.iconCount}
              className="size-full"
              seed={THUMB_SEED}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
