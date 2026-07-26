'use client'

import { speakerImageUrl } from '@/lib/sanity/client'
import { ModalShell } from '@/components/ModalShell'
import { SpeakerAvatarImage } from '@/components/common/SpeakerAvatarImage'

interface SpeakerImageModalProps {
  isOpen: boolean
  onClose: () => void
  speaker: {
    name: string
    title?: string
    image: string
  }
}

export function SpeakerImageModal({
  isOpen,
  onClose,
  speaker,
}: SpeakerImageModalProps) {
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      title={speaker.name}
      subtitle={speaker.title}
      className="border border-brand-frosted-steel bg-brand-glacier-white dark:border-gray-700"
    >
      <div className="overflow-hidden rounded-xl border border-brand-frosted-steel bg-white dark:border-gray-700 dark:bg-gray-800">
        <SpeakerAvatarImage
          src={speakerImageUrl(speaker.image, {
            width: 800,
            height: 800,
            fit: 'max',
          })}
          name={speaker.name}
          size={800}
        />
      </div>
    </ModalShell>
  )
}
