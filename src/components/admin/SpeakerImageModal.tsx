'use client'

import { DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
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
      className="overflow-hidden border border-brand-frosted-steel bg-brand-glacier-white dark:border-gray-700"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <DialogTitle className="font-space-grotesk truncate text-xl font-semibold text-brand-slate-gray dark:text-white">
            {speaker.name}
          </DialogTitle>
          {speaker.title && (
            <p className="mt-1 truncate text-sm text-brand-slate-gray/70 dark:text-gray-400">
              {speaker.title}
            </p>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 rounded text-gray-400 hover:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-gray-300"
          onClick={onClose}
          aria-label="Close"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

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
