'use client'

import { DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { sanityImage } from '@/lib/sanity/client'

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
    <ModalShell isOpen={isOpen} onClose={onClose} size="3xl">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <DialogTitle className="font-space-grotesk text-xl font-semibold text-brand-slate-gray dark:text-white">
            {speaker.name}
          </DialogTitle>
          {speaker.title && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {speaker.title}
            </p>
          )}
        </div>
        <button
          type="button"
          className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          onClick={onClose}
          aria-label="Close"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

      <div className="flex justify-center rounded-xl bg-gray-50 p-8 dark:bg-gray-800">
        <img
          src={sanityImage(speaker.image)
            .width(800)
            .height(800)
            .fit('max')
            .url()}
          alt={speaker.name}
          className="max-h-[600px] max-w-full rounded-lg object-contain"
          loading="eager"
        />
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={onClose}
          className="dark:hover:bg-brand-aqua rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-cloud-blue/90 dark:bg-brand-cloud-blue"
        >
          Close
        </button>
      </div>
    </ModalShell>
  )
}
