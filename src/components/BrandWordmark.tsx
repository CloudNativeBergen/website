'use client'

import { useId } from 'react'

/**
 * The DEFAULT brand mark for a tenant that has not uploaded a logo.
 *
 * Previously that fallback was `<Logo />` — the Cloud Native Days wordmark, with
 * CND's gradient stops baked in — so every new conference rendered another
 * conference's logo on its own site, in its own header, footer and OG images.
 * A platform cannot ship one tenant's mark as the default for all of them.
 *
 * So the default is generated from the tenant's own NAME instead: a wordmark for
 * the horizontal variant, an initials monogram for the square mark. Both are
 * SVG with a viewBox, so they size exactly like the hand-drawn logos they
 * replace (`h-12 w-auto` and friends keep working), and both paint with the
 * per-tenant `--brand-*` custom properties — the same THEMING L1 seam
 * `TenantThemeStyle` injects — so a themed conference gets a mark in its own
 * colours rather than the house blue.
 *
 * A conference with a real uploaded logo never reaches this code.
 */

/** Nominal viewBox height. All type metrics below are in these units. */
const VIEWBOX_HEIGHT = 100
/** Cap height of the wordmark type within the viewBox. */
const FONT_SIZE = 72
/** Baseline offset, chosen so the type sits optically centred. */
const BASELINE = 76
/** Horizontal padding on each side, as a fraction of the type width. */
const SIDE_PADDING_RATIO = 0.02

/**
 * Widest a ONE-LINE wordmark may get, as a multiple of its height.
 *
 * Callers size these marks by HEIGHT (`h-12 w-auto`), exactly as they sized the
 * hand-drawn logos. A designed logo has a fixed, moderate aspect ratio; a line
 * of type does not — "Cloud Native Day Bergen" on one line is roughly twice as
 * wide as the logo it replaces and shoves the footer nav off the row. Past this
 * ratio the name is set on two lines instead, which is what a real wordmark
 * does with a long name anyway.
 */
const MAX_SINGLE_LINE_RATIO = 5.5

/** Two-line metrics: smaller type, two baselines inside the same viewBox. */
const FONT_SIZE_TWO_LINE = 44
const BASELINE_TWO_LINE = [42, 92]

/**
 * Per-character advance widths in `em`, deliberately on the GENEROUS side.
 *
 * The rendered width cannot be measured at build time (and the display webfont
 * may not have loaded when the mark first paints), so the width is estimated
 * here and then pinned with `textLength` — see the note in {@link BrandWordmark}.
 */
const NARROW = new Set("iljtfIrJ1.,:;'!|()[]-")
const WIDE = new Set('mwMW@')
const UPPER = /[A-Z0-9ÆØÅ]/

function advanceEm(char: string): number {
  if (char === ' ') return 0.28
  if (NARROW.has(char)) return 0.34
  if (WIDE.has(char)) return 0.92
  if (UPPER.test(char)) return 0.68
  return 0.55
}

function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0
  for (const char of text) em += advanceEm(char)
  return em * fontSize
}

/**
 * Split `label` into the two lines whose widths are as close as possible, so a
 * long name breaks like a designed lockup ("Cloud Native Day / Bergen") rather
 * than orphaning a single word. Returns null when there is nothing to split.
 */
function balancedTwoLines(label: string): [string, string] | null {
  const words = label.split(/\s+/).filter(Boolean)
  if (words.length < 2) return null

  let best: [string, string] | null = null
  let bestWidth = Infinity
  for (let i = 1; i < words.length; i++) {
    const first = words.slice(0, i).join(' ')
    const second = words.slice(i).join(' ')
    const width = Math.max(
      estimateTextWidth(first, FONT_SIZE_TWO_LINE),
      estimateTextWidth(second, FONT_SIZE_TWO_LINE),
    )
    if (width < bestWidth) {
      bestWidth = width
      best = [first, second]
    }
  }
  return best
}

/** Words that carry no brand signal and are skipped when building a monogram. */
const MONOGRAM_STOPWORDS = new Set([
  'the',
  'and',
  'of',
  'for',
  'on',
  'in',
  'at',
  'a',
  'an',
])

/**
 * Up to two initials for the square mark: "Cloud Native Days Bergen" → "CN",
 * "Konf" → "K". Years and stopwords are skipped so an edition suffix does not
 * eat one of the two slots.
 */
export function monogramFor(name: string): string {
  const words = name
    .split(/[\s\-–—/]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(
      (word) =>
        word.length > 0 &&
        !/^\d+$/.test(word) &&
        !MONOGRAM_STOPWORDS.has(word.toLowerCase()),
    )

  if (words.length === 0) return '?'
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('')
}

export type BrandMarkVariant = 'gradient' | 'monochrome'

interface BrandMarkProps {
  /** The name to render — a conference title, or the platform name. */
  name: string
  variant?: BrandMarkVariant
  className?: string
  style?: React.CSSProperties
}

/**
 * The brand gradient, as SVG stops that read the tenant theme.
 *
 * `stop-color` accepts a `var()` reference, so these resolve through the exact
 * same custom properties as `bg-brand-gradient` in CSS — including the house
 * hex fallbacks when no tenant theme is injected.
 */
function BrandGradient({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="var(--brand-primary, #1d4ed8)" />
        <stop offset="1" stopColor="var(--brand-accent, #06b6d4)" />
      </linearGradient>
    </defs>
  )
}

/** Shared type styling for both marks. */
const TYPE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk), var(--font-inter), sans-serif',
  fontWeight: 700,
}

/**
 * Horizontal wordmark generated from `name`.
 *
 * The intrinsic width is ESTIMATED from the characters, then the type is pinned
 * to that width with `textLength` + `lengthAdjust="spacingAndGlyphs"`. Pinning
 * is what makes this safe: the estimate can never clip the name (the outer
 * `<svg>` clips by default) and can never leave stray trailing whitespace that
 * would break centring — whichever font actually paints, the type fills exactly
 * the box the viewBox aspect ratio reserved for it. The cost is a few percent
 * of horizontal tracking/stretch, which is invisible at wordmark sizes.
 */
export function BrandWordmark({
  name,
  variant = 'gradient',
  className,
  style,
}: BrandMarkProps) {
  const gradientId = useId()
  const label = name.trim() || '?'

  const singleWidth = estimateTextWidth(label, FONT_SIZE)
  const twoLines =
    singleWidth / VIEWBOX_HEIGHT > MAX_SINGLE_LINE_RATIO
      ? balancedTwoLines(label)
      : null

  const fontSize = twoLines ? FONT_SIZE_TWO_LINE : FONT_SIZE
  const lines = twoLines ?? [label]
  const lineWidths = lines.map((line) => estimateTextWidth(line, fontSize))
  const textWidth = Math.max(...lineWidths)
  const padding = textWidth * SIDE_PADDING_RATIO
  const width = textWidth + padding * 2
  const fill = variant === 'gradient' ? `url(#${gradientId})` : 'currentColor'

  return (
    <svg
      viewBox={`0 0 ${Math.round(width)} ${VIEWBOX_HEIGHT}`}
      role="img"
      aria-label={label}
      className={className}
      style={style}
    >
      {variant === 'gradient' && <BrandGradient id={gradientId} />}
      {lines.map((line, index) => (
        <text
          key={line}
          x={padding}
          y={twoLines ? BASELINE_TWO_LINE[index] : BASELINE}
          // Only the LONGER line is stretched to the box; the shorter one keeps
          // its natural width so the two lines stay flush-left, not justified.
          textLength={lineWidths[index]}
          lengthAdjust="spacingAndGlyphs"
          fontSize={fontSize}
          style={TYPE_STYLE}
          fill={fill}
        >
          {line}
        </text>
      ))}
    </svg>
  )
}

/**
 * Square monogram mark generated from `name` — a rounded badge carrying the
 * tenant's initials. Mirrors the platform's own badge-mark identity, so an
 * unbranded tenant still reads as "a conference on this platform" rather than
 * as some other conference.
 */
export function BrandMonogram({
  name,
  variant = 'gradient',
  className,
  style,
}: BrandMarkProps) {
  const gradientId = useId()
  const initials = monogramFor(name.trim() || '?')
  // One letter can sit larger than two without crowding the badge.
  const fontSize = initials.length > 1 ? 46 : 58

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={name.trim() || 'Conference'}
      className={className}
      style={style}
    >
      {variant === 'gradient' && <BrandGradient id={gradientId} />}
      {variant === 'gradient' ? (
        <>
          <rect
            x="2"
            y="2"
            width="96"
            height="96"
            rx="22"
            fill={`url(#${gradientId})`}
          />
          <text
            x="50"
            y="50"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize}
            style={TYPE_STYLE}
            fill="#fff"
          >
            {initials}
          </text>
        </>
      ) : (
        <>
          <rect
            x="4"
            y="4"
            width="92"
            height="92"
            rx="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
          />
          <text
            x="50"
            y="50"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize}
            style={TYPE_STYLE}
            fill="currentColor"
          >
            {initials}
          </text>
        </>
      )}
    </svg>
  )
}
