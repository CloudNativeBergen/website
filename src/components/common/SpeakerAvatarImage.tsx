'use client'

import { useCallback, useState } from 'react'
import { MissingAvatar } from './MissingAvatar'

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
      src={src}
      alt={name}
      className={`${className} h-full w-full object-cover object-center`}
      onError={() => setFailed(true)}
    />
  )
}
