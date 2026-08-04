/**
 * Brand-NEUTRAL layout tokens for the OpenGraph cards.
 *
 * The card's brand COLOURS are not here: they depend on the conference's stored
 * theme and are resolved per-request by `ogBrandColors` in `@/lib/og/brand`
 * (which falls back to the house palette in `@/lib/branding/theme`). Only values
 * that are the same for every tenant live in this table.
 */
export const STYLES = {
  // Brand typography for OG images
  fontFamily: 'Space Grotesk, system-ui, -apple-system, sans-serif',
  fontFamilyHeading: 'JetBrains Mono, Space Grotesk, monospace, sans-serif',
  fontFamilyBody: 'Inter, system-ui, -apple-system, sans-serif',
  borderRadius: {
    large: '28px',
    medium: '24px',
    small: '12px',
    tiny: '8px',
  },
  spacing: {
    large: '48px',
    medium: '32px',
    small: '16px',
    tiny: '8px',
  },
  colors: {
    white: 'white',
    whiteTransparent: 'rgba(255, 255, 255, 0.9)',
    whiteLight: 'rgba(255, 255, 255, 0.2)',
    whiteVeryLight: 'rgba(255, 255, 255, 0.1)',
    blackTransparent: 'rgba(0, 0, 0, 0.3)',
  },
  shadow: {
    text: '0 4px 8px rgba(0, 0, 0, 0.3)',
    textSmall: '0 2px 4px rgba(0, 0, 0, 0.2)',
    box: '0 20px 40px rgba(0, 0, 0, 0.1)',
  },
} as const

export const OG_IMAGE_SIZE = { width: 1200, height: 630 }
