'use client'

import React, { useState } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PhotoIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/outline'
import { useImageCarousel } from '@/hooks/useImageCarousel'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/Button'

interface ImageCarouselProps {
  images: GalleryImageWithSpeakers[]
  autoPlay?: boolean
  showThumbnails?: boolean
  className?: string
  onFullscreenClick?: () => void
}

export function ImageCarousel({
  images,
  autoPlay = false,
  showThumbnails = true,
  className,
  onFullscreenClick,
}: ImageCarouselProps) {
  const [imageLoadStates, setImageLoadStates] = useState<
    Record<string, boolean>
  >({})
  const [imageErrorStates, setImageErrorStates] = useState<
    Record<string, boolean>
  >({})

  const {
    currentIndex,
    goToNext,
    goToPrevious,
    goToIndex,
    startAutoPlay,
    stopAutoPlay,
    handleKeyDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useImageCarousel({
    totalImages: images.length,
    enableAutoPlay: autoPlay,
    enableKeyboard: true,
    enableTouch: true,
    globalKeyboard: false,
  })

  React.useEffect(() => {
    const currentImage = images[currentIndex]
    if (currentImage && imageLoadStates[currentImage._id] === undefined) {
      setImageLoadStates((prev) => ({
        ...prev,
        [currentImage._id]: false,
      }))
    }
  }, [currentIndex, images, imageLoadStates])

  if (!images || images.length === 0) {
    return null
  }

  const currentImage = images[currentIndex]
  const isCurrentImageLoading =
    currentImage &&
    imageLoadStates[currentImage._id] === false &&
    !imageErrorStates[currentImage._id]
  const hasCurrentImageError =
    currentImage && imageErrorStates[currentImage._id] === true

  return (
    <div
      className={cn('relative w-full', className)}
      onMouseEnter={stopAutoPlay}
      onMouseLeave={autoPlay ? startAutoPlay : undefined}
      onKeyDown={(e) => handleKeyDown(e.nativeEvent)}
      tabIndex={0}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
        <div
          className="relative h-full w-full"
          onTouchStart={(e) => handleTouchStart(e.nativeEvent)}
          onTouchMove={(e) => handleTouchMove(e.nativeEvent)}
          onTouchEnd={handleTouchEnd}
        >
          {isCurrentImageLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-brand-cloud-blue" />
            </div>
          )}

          {hasCurrentImageError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800">
              <PhotoIcon className="h-16 w-16 text-gray-400 dark:text-gray-500" />
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Failed to load image
              </p>
            </div>
          )}

          {currentImage?.imageUrl && !hasCurrentImageError && (
            <img
              src={`${currentImage.imageUrl}?w=2400&q=85&auto=format&fit=max`}
              srcSet={`${currentImage.imageUrl}?w=1200&q=85&auto=format&fit=max 1x, ${currentImage.imageUrl}?w=2400&q=85&auto=format&fit=max 2x`}
              alt={
                currentImage.imageAlt ??
                (currentImage.photographer
                  ? `Photo by ${currentImage.photographer}`
                  : 'Gallery image')
              }
              className={cn(
                'h-full w-full object-cover transition-opacity duration-500',
                isCurrentImageLoading ? 'opacity-0' : 'opacity-100',
              )}
              loading={currentIndex === 0 ? 'eager' : 'lazy'}
              onLoad={() => {
                setImageLoadStates((prev) => ({
                  ...prev,
                  [currentImage._id]: true,
                }))
              }}
              onError={() => {
                setImageErrorStates((prev) => ({
                  ...prev,
                  [currentImage._id]: true,
                }))
                setImageLoadStates((prev) => ({
                  ...prev,
                  [currentImage._id]: true,
                }))
              }}
            />
          )}

          {onFullscreenClick && (
            <Button
              onClick={(e) => {
                e.stopPropagation()
                onFullscreenClick()
              }}
              variant="icon"
              size="icon"
              className="absolute top-4 right-4"
              aria-label="View full gallery"
            >
              <ArrowsPointingOutIcon className="h-6 w-6" />
            </Button>
          )}
        </div>

        {images.length > 1 && (
          <>
            <Button
              onClick={(e) => {
                e.stopPropagation()
                goToPrevious()
              }}
              variant="icon"
              size="icon"
              className="absolute top-1/2 left-4 -translate-y-1/2"
              aria-label="Previous image"
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </Button>

            <Button
              onClick={(e) => {
                e.stopPropagation()
                goToNext()
              }}
              variant="icon"
              size="icon"
              className="absolute top-1/2 right-4 -translate-y-1/2"
              aria-label="Next image"
            >
              <ChevronRightIcon className="h-6 w-6" />
            </Button>
          </>
        )}

        {images.length > 1 && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 space-x-2">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation()
                  goToIndex(index)
                }}
                className={cn(
                  'h-2 w-2 rounded-full transition-all',
                  index === currentIndex
                    ? 'w-8 bg-white'
                    : 'bg-white/50 hover:bg-white/75',
                )}
                aria-label={`Go to image ${index + 1}`}
                aria-current={index === currentIndex}
              />
            ))}
          </div>
        )}
      </div>

      {showThumbnails && images.length > 1 && (
        <div className="mt-4 overflow-x-auto">
          <div className="flex space-x-2 pb-2">
            {images.map((image, index) => (
              <button
                key={image._id}
                onClick={() => goToIndex(index)}
                className={cn(
                  'relative h-20 w-32 flex-shrink-0 overflow-hidden rounded',
                  'transition-all hover:opacity-100',
                  index === currentIndex
                    ? 'ring-2 ring-brand-cloud-blue ring-offset-2'
                    : 'opacity-60',
                )}
              >
                {image.imageUrl && (
                  <img
                    src={`${image.imageUrl}?w=512&h=320&q=85&auto=format&fit=crop`}
                    srcSet={`${image.imageUrl}?w=256&h=160&q=85&auto=format&fit=crop 1x, ${image.imageUrl}?w=512&h=320&q=85&auto=format&fit=crop 2x`}
                    alt={
                      image.imageAlt ||
                      (image.photographer
                        ? `Photo by ${image.photographer}`
                        : '')
                    }
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {currentImage && (
        <div className="mt-4 text-center">
          <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-white">
            {currentImage.location}
          </h3>
          {currentImage.photographer && (
            <p className="mt-1 text-sm text-brand-slate-gray/70 dark:text-gray-400">
              Photo by {currentImage.photographer}
            </p>
          )}
          {currentImage.speakers && currentImage.speakers.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {currentImage.speakers.map((speaker) => (
                <span
                  key={speaker._id}
                  className="rounded-full bg-brand-cloud-blue/10 px-3 py-1 text-xs font-medium text-brand-cloud-blue dark:bg-brand-cloud-blue/20 dark:text-blue-300"
                >
                  {speaker.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Image {currentIndex + 1} of {images.length}
      </div>
    </div>
  )
}
