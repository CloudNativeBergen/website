'use client'

import { useState } from 'react'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { cn } from '@/lib/utils'

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
  const imageUrl = image.imageUrl
    ? `${image.imageUrl}?w=800&h=800&q=85&auto=format&fit=crop`
    : ''

  return (
    <button
      onClick={onClick}
      className="group relative aspect-square overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700"
    >
      {isLoading && (
        <div className="absolute inset-0 animate-pulse bg-gray-200 dark:bg-gray-700" />
      )}
      {imageUrl && (
        <img
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
  const sortedImages = [...images].sort((a, b) => {
    if (a.featured && !b.featured) return -1
    if (!a.featured && b.featured) return 1
    return 0
  })

  const limitedImages = sortedImages.slice(0, 6)

  return (
    <div
      className={cn(
        'hidden grid-cols-1 gap-4 sm:grid-cols-2 lg:grid lg:grid-cols-3',
        className,
      )}
    >
      {limitedImages.map((image, index) => (
        <PhotoGridItem
          key={image._id}
          image={image}
          index={index}
          onClick={() => onImageClick(index)}
        />
      ))}
    </div>
  )
}
