export const STYLES = {
  // Brand gradient: Cloud Blue (#1D4ED8) to Cyan (#06B6D4)
  gradient: 'linear-gradient(135deg, #1D4ED8, #06B6D4)',
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
    blue: '#1D4ED8',
    cyan: '#06B6D4',
  },
  shadow: {
    text: '0 4px 8px rgba(0, 0, 0, 0.3)',
    textSmall: '0 2px 4px rgba(0, 0, 0, 0.2)',
    box: '0 20px 40px rgba(0, 0, 0, 0.1)',
  },
} as const

export const OG_IMAGE_SIZE = { width: 1200, height: 630 }
