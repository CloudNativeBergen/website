'use client'

import { useState, useCallback } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { useImageCarousel } from '@/hooks/useImageCarousel'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { cn } from '@/lib/utils'
import { sanityImage } from '@/lib/sanity/client'

interface SimpleImageCarouselProps {
  images: GalleryImageWithSpeakers[]
  onImageClick: (index: number) => void
  className?: string
}

export function SimpleImageCarousel({
  images,
  onImageClick,
  className,
}: SimpleImageCarouselProps) {
  const [loadedImageIds, setLoadedImageIds] = useState<Set<string>>(new Set())

  const {
    currentIndex,
    goToNext,
    goToPrevious,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useImageCarousel({
    totalImages: images.length,
    enableKeyboard: false,
    enableTouch: true,
    globalKeyboard: false,
  })

  const currentImage = images[currentIndex]

  const handleImageLoad = useCallback((imageId: string) => {
    setLoadedImageIds((prev) => new Set(prev).add(imageId))
  }, [])

  const handleImageRef = useCallback(
    (el: HTMLImageElement | null) => {
      if (el && el.complete && el.naturalHeight > 0 && currentImage) {
        setLoadedImageIds((prev) => {
          if (prev.has(currentImage._id)) {
            return prev
          }
          return new Set(prev).add(currentImage._id)
        })
      }
    },
    [currentImage],
  )

  if (!images || images.length === 0) {
    return null
  }

  const isCurrentImageLoaded =
    currentImage && loadedImageIds.has(currentImage._id)

  return (
    <div className={cn('relative w-full lg:hidden', className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
        <div
          className="relative h-full w-full"
          onTouchStart={(e) => handleTouchStart(e.nativeEvent)}
          onTouchMove={(e) => handleTouchMove(e.nativeEvent)}
          onTouchEnd={handleTouchEnd}
        >
          {!isCurrentImageLoaded && (
            <div className="absolute inset-0 animate-pulse bg-gray-200 dark:bg-gray-700" />
          )}

          {currentImage?.image && (
            <button
              onClick={() => onImageClick(currentIndex)}
              className="h-full w-full cursor-pointer"
            >
              <img
                ref={handleImageRef}
                src={sanityImage(currentImage.image)
                  .width(1200)
                  .quality(85)
                  .fit('max')
                  .url()}
                alt={
                  currentImage.imageAlt ??
                  (currentImage.photographer
                    ? `Photo by ${currentImage.photographer}`
                    : 'Gallery image')
                }
                className="h-full w-full object-cover transition-opacity duration-300 hover:opacity-95"
                loading={currentIndex === 0 ? 'eager' : 'lazy'}
                onLoad={() => handleImageLoad(currentImage._id)}
              />
            </button>
          )}

          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  goToPrevious()
                }}
                className={cn(
                  'absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/50 p-2',
                  'text-white backdrop-blur-sm transition-all hover:bg-black/70',
                )}
                aria-label="Previous image"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  goToNext()
                }}
                className={cn(
                  'absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/50 p-2',
                  'text-white backdrop-blur-sm transition-all hover:bg-black/70',
                )}
                aria-label="Next image"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </>
          )}

          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 space-x-2">
              {images.map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    'h-2 w-2 rounded-full transition-all',
                    index === currentIndex ? 'w-8 bg-white' : 'bg-white/50',
                  )}
                  aria-label={`Image ${index + 1}`}
                  aria-current={index === currentIndex}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
