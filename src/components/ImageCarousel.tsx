'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useImageCarousel } from '@/hooks/useImageCarousel';
import { GalleryImageWithSpeakers } from '@/lib/gallery/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/Button';

interface ImageCarouselProps {
  images: GalleryImageWithSpeakers[];
  autoPlay?: boolean;
  showThumbnails?: boolean;
  className?: string;
  onImageClick?: (image: GalleryImageWithSpeakers, index: number) => void;
}

export function ImageCarousel({
  images,
  autoPlay = false,
  showThumbnails = true,
  className,
  onImageClick,
}: ImageCarouselProps) {
  const [imageLoadStates, setImageLoadStates] = useState<Record<string, boolean>>({});
  const [imageErrorStates, setImageErrorStates] = useState<Record<string, boolean>>({});

  const {
    currentIndex,
    goToNext,
    goToPrevious,
    goToIndex,
    startAutoPlay,
    stopAutoPlay,
    handleKeyDownReact,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useImageCarousel({
    totalImages: images.length,
    enableAutoPlay: autoPlay,
    enableKeyboard: true,
    enableTouch: true,
    globalKeyboard: false,
  });

  if (!images || images.length === 0) {
    return null;
  }

  const currentImage = images[currentIndex];
  const isCurrentImageLoading = currentImage && !imageLoadStates[currentImage._id] && !imageErrorStates[currentImage._id];
  const hasCurrentImageError = currentImage && imageErrorStates[currentImage._id];

  return (
    <div 
      className={cn('relative w-full', className)}
      onMouseEnter={stopAutoPlay}
      onMouseLeave={autoPlay ? startAutoPlay : undefined}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-gray-100">
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
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100">
              <svg className="h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="mt-2 text-sm text-gray-600">Failed to load image</p>
            </div>
          )}

          {currentImage?.imageUrl && !hasCurrentImageError && (
            <button
              type="button"
              onClick={() => onImageClick?.(currentImage, currentIndex)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && onImageClick) {
                  e.preventDefault();
                  onImageClick(currentImage, currentIndex);
                } else {
                  handleKeyDownReact(e);
                }
              }}
              className="relative h-full w-full focus:outline-none focus:ring-2 focus:ring-brand-cloud-blue focus:ring-inset"
              disabled={!onImageClick}
              style={{ cursor: onImageClick ? 'pointer' : 'default' }}
            >
              <Image
                src={currentImage.imageUrl}
                alt={currentImage.imageAlt ?? (currentImage.photographer ? `Photo by ${currentImage.photographer}` : 'Gallery image')}
                fill
                className={cn(
                  "object-cover transition-opacity duration-500",
                  isCurrentImageLoading ? "opacity-0" : "opacity-100"
                )}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
                priority={currentIndex === 0}
                onLoadingComplete={() => {
                  setImageLoadStates(prev => ({ ...prev, [currentImage._id]: true }));
                }}
                onError={() => {
                  setImageErrorStates(prev => ({ ...prev, [currentImage._id]: true }));
                }}
              />
            </button>
          )}
        </div>

        {images.length > 1 && (
          <>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                goToPrevious();
              }}
              variant="icon"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2"
              aria-label="Previous image"
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </Button>

            <Button
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
              variant="icon"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2"
              aria-label="Next image"
            >
              <ChevronRightIcon className="h-6 w-6" />
            </Button>
          </>
        )}

        {images.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  goToIndex(index);
                }}
                className={cn(
                  'h-2 w-2 rounded-full transition-all',
                  index === currentIndex
                    ? 'w-8 bg-white'
                    : 'bg-white/50 hover:bg-white/75'
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
                    : 'opacity-60'
                )}
              >
                {image.imageUrl && (
                  <Image
                    src={image.imageUrl}
                    alt={image.imageAlt || (image.photographer ? `Photo by ${image.photographer}` : '')}
                    fill
                    className="object-cover"
                    sizes="128px"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {currentImage && (
        <div className="mt-4 text-center">
          <h3 className="font-space-grotesk text-lg font-semibold text-gray-900">
            {currentImage.location}
          </h3>
          {currentImage.photographer && (
            <p className="mt-1 text-sm text-gray-600">
              Photo by {currentImage.photographer}
            </p>
          )}
          {currentImage.speakers && currentImage.speakers.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {currentImage.speakers.map((speaker) => (
                <span
                  key={speaker._id}
                  className="rounded-full bg-brand-cloud-blue/10 px-3 py-1 text-xs font-medium text-brand-cloud-blue"
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
  );
}