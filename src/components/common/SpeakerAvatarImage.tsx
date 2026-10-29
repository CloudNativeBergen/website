'use client'

import { useCallback, useState } from 'react'
import { MissingAvatar } from './MissingAvatar'
import { speakerImageUrl } from '@/lib/sanity/client'

interface SpeakerAvatarImageProps {
  src: string
  name: string
  size: number
  className?: string
  textSizeClass?: string
}

export function SpeakerAvatarImage({
  src,
  name,
  size,
  className = '',
  textSizeClass,
}: SpeakerAvatarImageProps) {
  const [failed, setFailed] = useState(false)

  // Callback ref detects images that already failed before React hydration
  // attached the onError handler (e.g. broken URLs on slow connections).
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) {
      setFailed(true)
    }
  }, [])

  if (failed) {
    return (
      <MissingAvatar
        name={name}
        size={size}
        className={className}
        textSizeClass={textSizeClass}
      />
    )
  }

  return (
    <img
      ref={imgRef}
      src={avatarSrc(src, size)}
      alt={name}
      className={`${className} h-full w-full object-cover object-center`}
      onError={() => setFailed(true)}
    />
  )
}

/**
 * Raw Sanity asset URLs are full-size originals (often 1-4 MB). Ask the image
 * CDN for a 2x crop instead. URLs that already carry params or point elsewhere
 * are left alone.
 */
function avatarSrc(src: string, size: number): string {
  if (src.includes('?')) return src
  const px = Math.max(64, Math.ceil((size * 2) / 32) * 32)
  return speakerImageUrl(src, { width: px, height: px, fit: 'crop' })
}
