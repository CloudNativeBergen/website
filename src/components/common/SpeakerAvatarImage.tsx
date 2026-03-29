'use client'

import { useState } from 'react'
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
      src={src}
      alt={name}
      className={`${className} h-full w-full object-cover object-center`}
      onError={() => setFailed(true)}
    />
  )
}
