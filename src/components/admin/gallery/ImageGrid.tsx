'use client'

import { useState } from 'react'
import {
  PencilIcon,
  TrashIcon,
  StarIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { ConfirmationModal } from '../ConfirmationModal'

/**
 * ImageGrid Component
 *
 * Displays gallery images in a responsive grid with:
 * - Multi-select capability
 * - Individual and bulk actions (feature/unfeature, delete)
 * - Image metadata overlay on hover
 * - Featured status indicator
 */
interface ImageGridProps {
  images: GalleryImageWithSpeakers[]
  onImageUpdate: (image: GalleryImageWithSpeakers) => void
  onImageDelete: (imageId: string) => void
  onToggleFeatured: (imageId: string, featured: boolean) => Promise<void>
  selectedImages: string[]
  onSelectionChange: (selected: string[]) => void
}

export function ImageGrid({
  images,
  onImageUpdate,
  onImageDelete,
  onToggleFeatured,
  selectedImages,
  onSelectionChange,
}: ImageGridProps) {
  const [hoveredImage, setHoveredImage] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>(
    {},
  )

  const handleSelectImage = (imageId: string) => {
    if (selectedImages.includes(imageId)) {
      onSelectionChange(selectedImages.filter((id) => id !== imageId))
    } else {
      onSelectionChange([...selectedImages, imageId])
    }
  }

  const handleSelectAll = () => {
    if (selectedImages.length === images.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(images.map((img) => img._id))
    }
  }

  const handleToggleFeatured = async (
    imageId: string,
    targetFeatured: boolean,
  ) => {
    setLoadingStates((prev) => ({ ...prev, [imageId]: true }))
    try {
      await onToggleFeatured(imageId, targetFeatured)
    } finally {
      setLoadingStates((prev) => ({ ...prev, [imageId]: false }))
    }
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirmId === 'bulk') {
      selectedImages.forEach((imageId) => {
        onImageDelete(imageId)
      })
      onSelectionChange([])
      setDeleteConfirmId(null)
    } else if (deleteConfirmId) {
      onImageDelete(deleteConfirmId)
      setDeleteConfirmId(null)
    }
  }

  return (
    <>
      <div className="mb-4 flex min-h-[2rem] items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label={
              selectedImages.length === images.length
                ? 'Deselect all images'
                : 'Select all images'
            }
          >
            <div
              className={`h-4 w-4 rounded border ${selectedImages.length === images.length && images.length > 0
                  ? 'border-indigo-600 bg-indigo-600 dark:border-indigo-500 dark:bg-indigo-500'
                  : 'border-gray-300 dark:border-gray-600'
                }`}
            >
              {selectedImages.length === images.length && images.length > 0 && (
                <CheckIcon className="h-3 w-3 text-white" />
              )}
            </div>
            Select All
          </button>
          {selectedImages.length > 0 && (
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {selectedImages.length} selected
            </span>
          )}
        </div>
        {selectedImages.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const toToggle = images.filter((img) =>
                  selectedImages.includes(img._id),
                )
                const allFeatured = toToggle.every((img) => img.featured)
                for (const image of toToggle) {
                  await handleToggleFeatured(image._id, !allFeatured)
                }
                onSelectionChange([])
              }}
              className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {images
                .filter((img) => selectedImages.includes(img._id))
                .every((img) => img.featured)
                ? 'Unfeature Selected'
                : 'Feature Selected'}
            </button>
            <button
              onClick={() => setDeleteConfirmId('bulk')}
              className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
            >
              Delete Selected
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {images.map((image) => (
          <div
            key={image._id}
            className={`group relative overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 ${selectedImages.length > 0 ? 'cursor-pointer' : ''
              }`}
            onMouseEnter={() => setHoveredImage(image._id)}
            onMouseLeave={() => setHoveredImage(null)}
            onClick={(e) => {
              if (selectedImages.length > 0 && e.currentTarget === e.target) {
                handleSelectImage(image._id)
              }
            }}
          >
            <div className="absolute top-2 left-2 z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleSelectImage(image._id)
                }}
                className="bg-opacity-80 hover:bg-opacity-100 rounded bg-white p-1 shadow-sm dark:bg-gray-900"
              >
                <div
                  className={`h-4 w-4 rounded border ${selectedImages.includes(image._id)
                      ? 'border-indigo-600 bg-indigo-600 dark:border-indigo-500 dark:bg-indigo-500'
                      : 'border-gray-400 dark:border-gray-500'
                    }`}
                >
                  {selectedImages.includes(image._id) && (
                    <CheckIcon className="h-3 w-3 text-white" />
                  )}
                </div>
              </button>
            </div>

            {image.featured && (
              <div className="absolute top-2 right-2 z-10">
                <StarIconSolid className="h-6 w-6 text-yellow-400 drop-shadow-md" />
              </div>
            )}

            <div
              className="relative aspect-video"
              onClick={() => {
                if (selectedImages.length > 0) {
                  handleSelectImage(image._id)
                }
              }}
            >
              {image.imageUrl ? (
                <img
                  src={`${image.imageUrl}?w=800&q=85&auto=format&fit=max`}
                  alt={image.imageAlt || ''}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-500">
                  No image
                </div>
              )}
            </div>

            <div
              className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 transition-opacity ${hoveredImage === image._id
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
                }`}
            >
              <div className="text-sm text-white">
                <p className="font-medium">{image.photographer}</p>
                <p className="text-xs opacity-90">{image.location}</p>
                <p className="text-xs opacity-90">{image.date}</p>
                {image.speakers && image.speakers.length > 0 && (
                  <p className="mt-1 text-xs">
                    {image.speakers.map((s) => s.name).join(', ')}
                  </p>
                )}
              </div>
            </div>

            <div
              className={`absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center gap-2 transition-opacity ${hoveredImage === image._id ? 'opacity-100' : 'opacity-0'
                }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onImageUpdate(image)
                }}
                className="rounded-full bg-white p-2 text-gray-700 shadow-lg hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                title="Edit metadata"
              >
                <PencilIcon className="h-5 w-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleToggleFeatured(image._id, !image.featured)
                }}
                disabled={loadingStates[image._id]}
                className="rounded-full bg-white p-2 text-gray-700 shadow-lg hover:bg-gray-100 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                title={
                  image.featured ? 'Remove from featured' : 'Add to featured'
                }
              >
                {image.featured ? (
                  <StarIconSolid className="h-5 w-5 text-yellow-500" />
                ) : (
                  <StarIcon className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteConfirmId(image._id)
                }}
                className="rounded-full bg-white p-2 text-red-600 shadow-lg hover:bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-gray-700"
                title="Delete image"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmationModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={handleDeleteConfirm}
        variant="danger"
        title={
          deleteConfirmId === 'bulk'
            ? `Delete ${selectedImages.length} Images`
            : 'Delete Image'
        }
        message={
          deleteConfirmId === 'bulk'
            ? `Are you sure you want to delete ${selectedImages.length} selected images? This action cannot be undone.`
            : 'Are you sure you want to delete this image? This action cannot be undone.'
        }
        confirmButtonText="Delete"
      />
    </>
  )
}
