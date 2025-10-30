'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import { GalleryModal } from '@/components/GalleryModal'
import { PhotoIcon } from '@heroicons/react/24/outline'
import { sanityImage } from '@/lib/sanity/client'
import Image from 'next/image'

/**
 * SpeakerGallery Component
 *
 * Displays photos where the authenticated speaker has been tagged.
 * Shows a grid of up to 6 photos with a modal to view all photos.
 *
 * Features:
 * - Fetches speaker's tagged photos via tRPC
 * - Grid layout with responsive design
 * - Click to open full-screen modal with all photos
 * - Empty state when no photos
 * - Loading state with skeleton placeholders
 */

export function SpeakerGallery() {
  const { data: images = [], isLoading } = api.gallery.listMine.useQuery()
  const { data: count = 0 } = api.gallery.countMine.useQuery()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)

  const displayImages = images.slice(0, 6)
  const hasMore = images.length > 6

  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index)
    setIsModalOpen(true)
  }

  const handleViewAll = () => {
    setSelectedImageIndex(0)
    setIsModalOpen(true)
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-brand-frosted-steel bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhotoIcon className="h-5 w-5 text-brand-cloud-blue dark:text-blue-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              My Photos
            </h2>
          </div>
        </div>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Photos where you&apos;ve been tagged
        </p>

        {/* Loading skeleton */}
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
            />
          ))}
        </div>
      </div>
    )
  }

  if (!images.length) {
    return (
      <div className="rounded-xl border border-brand-frosted-steel bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhotoIcon className="h-5 w-5 text-brand-cloud-blue dark:text-blue-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              My Photos
            </h2>
          </div>
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-12 dark:border-gray-600">
          <PhotoIcon className="mb-3 h-12 w-12 text-gray-400 dark:text-gray-500" />
          <p className="mb-1 text-center text-sm font-medium text-gray-900 dark:text-white">
            No photos yet
          </p>
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            You&apos;ll see photos here when
            <br />
            organizers tag you in conference photos
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-brand-frosted-steel bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhotoIcon className="h-5 w-5 text-brand-cloud-blue dark:text-blue-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              My Photos
            </h2>
            {count > 0 && (
              <span className="rounded-full bg-brand-cloud-blue/10 px-2.5 py-0.5 text-xs font-medium text-brand-cloud-blue dark:bg-blue-900/30 dark:text-blue-400">
                {count}
              </span>
            )}
          </div>
        </div>

        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Photos where you&apos;ve been tagged
        </p>

        {/* Photo grid */}
        <div className="grid grid-cols-2 gap-3">
          {displayImages.map((image, index) => (
            <button
              key={image._id}
              onClick={() => handleImageClick(index)}
              className="group relative aspect-square overflow-hidden rounded-lg transition-transform hover:scale-105 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue"
            >
              {image.imageUrl && (
                <Image
                  src={sanityImage(image.imageUrl).width(400).height(400).url()}
                  alt={image.imageAlt || `Photo by ${image.photographer}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 200px"
                />
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
              <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/60 to-transparent p-2 transition-transform group-hover:translate-y-0">
                <p className="text-xs text-white">
                  {new Date(image.date).toLocaleDateString()}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* View all button */}
        {hasMore && (
          <button
            onClick={handleViewAll}
            className="mt-4 w-full rounded-lg bg-brand-cloud-blue/10 py-2.5 text-sm font-medium text-brand-cloud-blue transition-colors hover:bg-brand-cloud-blue/20 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
          >
            View All {count} Photos
          </button>
        )}
      </div>

      {/* Modal for viewing all photos */}
      {images.length > 0 && (
        <GalleryModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          images={images}
          initialIndex={selectedImageIndex}
        />
      )}
    </>
  )
}
