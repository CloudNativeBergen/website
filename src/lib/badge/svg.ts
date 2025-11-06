/**
 * SVG Badge Generator
 *
 * Creates customizable speaker/organizer badges with curved text paths
 * following the circular badge design. Uses native SVG <textPath> elements
 * for text-on-path rendering without complex calculations.
 */

import type { BadgeType } from './types'
import BadgeGraphics from './graphics/2025'

const COLORS = {
  aqua: '#06B6D4',
  cloudBlue: '#1D4ED8',
  skyMist: '#E0F2FE',
  darkBlue: '#032B45',
  white: '#FFFFFF',
} as const

export interface BadgeSVGOptions {
  conferenceTitle: string
  conferenceYear: string
  conferenceDate: string
  badgeType: BadgeType
  centerGraphicSvg?: string
}

/**
 * Generates a complete badge SVG with curved text paths
 */
export function generateBadgeSVG(options: BadgeSVGOptions): string {
  const { conferenceDate, badgeType, centerGraphicSvg } = options

  const badgeTypeText = badgeType === 'speaker' ? 'SPEAKER' : 'ORGANIZER'
  const topText = 'CLOUD NATIVE DAY BERGEN'

  // SVG template with curved text paths
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 920 920" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: auto;">
  <defs>
    <!-- Path for top curved text - larger arc to fit longer text -->
    <path id="topArc" d="M 100,470 A 360,360 0 0,1 820,470" />

    <!-- Path for bottom curved text - larger arc for better fit -->
    <path id="bottomArc" d="M 140,670 A 360,360 0 0,0 780,670" />
  </defs>

  <!-- Background circle -->
  <circle cx="460" cy="460" r="460" fill="${COLORS.aqua}"/>

  <!-- Outer ring -->
  <circle cx="459.5" cy="460.5" r="378.5" stroke="${COLORS.darkBlue}" stroke-width="130"/>

  <!-- Inner circle background -->
  <circle cx="460" cy="460" r="297" fill="${COLORS.skyMist}"/>

  <!-- Center graphic area (Bergen skyline) -->
  <g transform="translate(195, 180)">
    ${centerGraphicSvg || BadgeGraphics}
  </g>

  <!-- Bottom banner for badge type -->
  <path d="M913 540.375C901.705 604.473 877.138 663.994 842.238 716H77.7617C42.4314 663.352 17.6905 603.003 6.58789 538H913V540.375Z" fill="${COLORS.cloudBlue}"/>

  <!-- Top curved text (bigger) -->
  <text font-family="Arial, sans-serif" font-size="76" font-weight="bold" fill="${COLORS.white}" letter-spacing="1">
    <textPath href="#topArc" startOffset="50%" text-anchor="middle">
      ${topText}
    </textPath>
  </text>

  <!-- Badge type text (SPEAKER/ORGANIZER - moved down slightly) -->
  <text x="460" y="635" font-family="Arial, sans-serif" font-size="115" font-weight="bold" fill="${COLORS.white}" text-anchor="middle" dominant-baseline="middle">
    ${badgeTypeText}
  </text>

  <!-- Bottom curved text (date - bigger) -->
  <text font-family="Arial, sans-serif" font-size="70" font-weight="600" fill="${COLORS.aqua}" letter-spacing="0">
    <textPath href="#bottomArc" startOffset="50%" text-anchor="middle">
      ${conferenceDate.toUpperCase()}
    </textPath>
  </text>
</svg>`

  return svg
}
