'use client'

import { useState } from 'react'
import { GalleryModal } from '@/components/GalleryModal'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { PhotoIcon } from '@heroicons/react/24/outline'
import { sanityImage } from '@/lib/sanity/client'

interface CompactPhotoStripProps {
  images: GalleryImageWithSpeakers[]
  conferenceName: string
}

export function CompactPhotoStrip({
  images,
  conferenceName,
}: CompactPhotoStripProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const visibleImages = images.slice(0, 6)
  const remainingCount = images.length - 6

  const handleImageClick = (index: number) => {
    setSelectedIndex(index)
    setIsModalOpen(true)
  }

  return (
    <>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Photos ({images.length})
          </h4>
          <button
            onClick={() => {
              setSelectedIndex(0)
              setIsModalOpen(true)
            }}
            className="cursor-pointer text-xs font-medium text-brand-cloud-blue transition-colors hover:text-brand-cloud-blue/80 dark:text-blue-400 dark:hover:text-blue-300"
          >
            View All →
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {visibleImages.map((image, index) => (
            <button
              key={image._id}
              onClick={() => handleImageClick(index)}
              className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-200 transition-transform hover:scale-105 dark:bg-gray-700"
            >
              {image.image && (
                <img
                  src={sanityImage(image.image)
                    .width(160)
                    .height(160)
                    .fit('crop')
                    .url()}
                  alt={image.imageAlt || `Photo from ${conferenceName}`}
                  className="h-full w-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
            </button>
          ))}

          {remainingCount > 0 && (
            <button
              onClick={() => {
                setSelectedIndex(6)
                setIsModalOpen(true)
              }}
              className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
            >
              <PhotoIcon className="h-6 w-6" />
              <span className="mt-1 text-xs font-medium">
                +{remainingCount}
              </span>
            </button>
          )}
        </div>
      </div>

      <GalleryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        images={images}
        initialIndex={selectedIndex}
      />
    </>
  )
}
