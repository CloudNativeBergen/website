import React from 'react'
import { createSvgDataUrl } from './helpers'

const USER_ICON_SVG =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clip-rule="evenodd"/></svg>`,
  ).toString('base64')

const MICROPHONE_ICON_SVG =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  ).toString('base64')

const LIGHTBULB_ICON_SVG =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M15 14c.5-1 .875-2.5.875-4a3.875 3.875 0 0 0-7.75 0c0 1.5.375 3 .875 4"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  ).toString('base64')

export const UserIcon = ({ size }: { size: number }) => (
  <img
    src={USER_ICON_SVG}
    alt=""
    width={size}
    height={size}
    style={{ color: 'white' }}
  />
)

export const MicrophoneIcon = ({ size }: { size: number }) => (
  <img
    src={MICROPHONE_ICON_SVG}
    alt=""
    width={size}
    height={size}
    style={{ color: 'white' }}
  />
)

export const LightBulbIcon = ({ size }: { size: number }) => (
  <img
    src={LIGHTBULB_ICON_SVG}
    alt=""
    width={size}
    height={size}
    style={{ color: 'white' }}
  />
)

export const BackgroundPatterns = () => (
  <>
    <div
      style={{
        position: 'absolute',
        top: '-50px',
        right: '-50px',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.1)',
        display: 'flex',
      }}
    />
    <div
      style={{
        position: 'absolute',
        bottom: '-100px',
        left: '-100px',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.03)',
        display: 'flex',
      }}
    />
    <div
      style={{
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        opacity: 0.02,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        display: 'flex',
      }}
    />
  </>
)

export const ConferenceLogo = ({
  logoSvg,
  size = 'medium',
}: {
  logoSvg: string | null
  size?: 'small' | 'medium' | 'large' | 'xlarge'
}) => {
  if (!logoSvg) return null

  const sizes = {
    small: { width: 80, height: 80 },
    medium: { width: 120, height: 120 },
    large: { width: 180, height: 180 },
    xlarge: { width: 360, height: 360 },
  }

  const dataUrl = createSvgDataUrl(logoSvg)
  if (!dataUrl) return null

  return (
    <img
      src={dataUrl}
      alt="Conference Logo"
      width={sizes[size].width}
      height={sizes[size].height}
      style={{ objectFit: 'contain' }}
    />
  )
}
