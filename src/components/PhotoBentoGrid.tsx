'use client'

import { useState } from 'react'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { cn } from '@/lib/utils'
import { sanityImage } from '@/lib/sanity/client'

interface PhotoBentoGridProps {
  images: GalleryImageWithSpeakers[]
  onImageClick: (index: number) => void
  className?: string
}

function PhotoGridItem({
  image,
  index,
  onClick,
}: {
  image: GalleryImageWithSpeakers
  index: number
  onClick: () => void
}) {
  const [isLoading, setIsLoading] = useState(true)
  const imageUrl = image.image
    ? sanityImage(image.image)
        .width(800)
        .height(800)
        .quality(85)
        .fit('crop')
        .url()
    : ''

  const handleImageRef = (el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalHeight > 0) {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={onClick}
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700"
    >
      {isLoading && (
        <div className="absolute inset-0 animate-pulse bg-gray-200 dark:bg-gray-700" />
      )}
      {imageUrl && (
        <img
          ref={handleImageRef}
          src={imageUrl}
          alt={
            image.imageAlt ||
            (image.photographer ? `Photo by ${image.photographer}` : '')
          }
          className="h-full w-full object-cover transition-opacity duration-300 hover:opacity-95"
          loading={index === 0 ? 'eager' : 'lazy'}
          onLoad={() => setIsLoading(false)}
        />
      )}
    </button>
  )
}

export function PhotoBentoGrid({
  images,
  onImageClick,
  className,
}: PhotoBentoGridProps) {
  // Select a diverse set of images for preview
  // Keep track of original indices before any sorting
  const getPreviewImages = () => {
    // Add original index to each image before sorting
    const imagesWithIndex = images.map((img, idx) => ({
      image: img,
      originalIndex: idx,
    }))

    // Sort by featured status
    const sorted = [...imagesWithIndex].sort((a, b) => {
      if (a.image.featured && !b.image.featured) return -1
      if (!a.image.featured && b.image.featured) return 1
      return 0
    })

    if (sorted.length <= 6) {
      return sorted
    }

    // Take featured images first
    const featured = sorted.filter((item) => item.image.featured).slice(0, 3)
    const remaining = 6 - featured.length

    // Spread remaining picks across non-featured images
    const nonFeatured = sorted.filter((item) => !item.image.featured)
    const step = Math.max(1, Math.floor(nonFeatured.length / remaining))
    const spreadPicks = Array.from(
      { length: remaining },
      (_, i) => nonFeatured[Math.min(i * step, nonFeatured.length - 1)],
    )

    return [...featured, ...spreadPicks].slice(0, 6)
  }

  const previewImages = getPreviewImages()

  return (
    <div
      className={cn(
        'hidden grid-cols-1 gap-4 sm:grid-cols-2 lg:grid lg:grid-cols-3',
        className,
      )}
    >
      {previewImages.map(({ image, originalIndex }, displayIndex) => (
        <PhotoGridItem
          key={image._id}
          image={image}
          index={displayIndex}
          onClick={() => onImageClick(originalIndex)}
        />
      ))}
    </div>
  )
}
