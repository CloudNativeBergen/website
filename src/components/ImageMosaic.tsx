'use client'

import React from 'react'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { cn } from '@/lib/utils'
import {
  galleryImageSrc,
  isInlineImageDataUri,
  sanityImage,
} from '@/lib/sanity/client'

/**
 * A Sanity asset id encodes its own pixel dimensions (`image-<sha1>-<w>x<h>-<ext>`),
 * which is all the mosaic needs to reserve each tile's space before the photo
 * arrives — a masonry column that resizes as images load is the worst version of
 * this layout. Layout-only: nothing here is used to build a URL, so this stays a
 * lenient parse rather than the anchored security pattern the rich-text image
 * pipeline uses.
 */
function tileAspectRatio(image: GalleryImageWithSpeakers): string {
  const ref = image.image?.asset?._ref
  const match = ref ? /-(\d{1,5})x(\d{1,5})-/.exec(ref) : null
  if (!match) return '3 / 2'
  return `${match[1]} / ${match[2]}`
}

function imageAltText(image: GalleryImageWithSpeakers): string {
  return (
    image.imageAlt ??
    (image.photographer ? `Photo by ${image.photographer}` : 'Gallery image')
  )
}

interface ImageMosaicProps {
  images: GalleryImageWithSpeakers[]
  /** Opens the lightbox on the clicked tile. Omit to render a static wall. */
  onImageClick?: (index: number) => void
  className?: string
}

/**
 * A static mosaic of photos — every image visible at once, in a CSS-column
 * masonry that keeps each photo's own aspect ratio (no cropping, no letterbox).
 *
 * The counterpart to {@link ImageCarousel}: no autoplay, no timers, no
 * previous/next controls, nothing that moves on its own. That makes it the
 * skimmable option — and the honest one for visitors who dislike carousels or
 * who ask the platform for reduced motion.
 */
export function ImageMosaic({
  images,
  onImageClick,
  className,
}: ImageMosaicProps) {
  if (!images || images.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        'columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4',
        className,
      )}
    >
      {images.map((image, index) => {
        const alt = imageAltText(image)
        const tile = (
          <>
            {image.image && (
              <img
                src={galleryImageSrc(image, {
                  width: 800,
                  quality: 85,
                  fit: 'max',
                })}
                // Inline artwork has no responsive renditions — a srcSet could
                // only repeat the same bytes at 1x and 2x. Same rule as
                // ImageCarousel.
                srcSet={
                  isInlineImageDataUri(image.imageUrl)
                    ? undefined
                    : `${sanityImage(image.image).width(600).quality(85).fit('max').url()} 1x, ${sanityImage(image.image).width(1200).quality(85).fit('max').url()} 2x`
                }
                alt={alt}
                style={{ aspectRatio: tileAspectRatio(image) }}
                className="w-full object-cover"
                loading={index < 4 ? 'eager' : 'lazy'}
              />
            )}
            {image.photographer && (
              /* One line, always: the credit is owed to the photographer, but
                 on a narrow column a wrapping credit covers the photo it is
                 crediting. */
              <span className="pointer-events-none absolute inset-x-0 bottom-0 block truncate bg-linear-to-t from-black/70 to-transparent px-3 pt-6 pb-2 text-left text-[10px] font-medium text-white sm:text-xs">
                Photo by {image.photographer}
              </span>
            )}
          </>
        )

        const tileClassName =
          'relative mb-3 block w-full overflow-hidden rounded-xl bg-gray-100 ring-1 ring-black/5 break-inside-avoid sm:mb-4 dark:bg-gray-800 dark:ring-white/10'

        return onImageClick ? (
          <button
            key={image._id}
            type="button"
            onClick={() => onImageClick(index)}
            className={cn(
              tileClassName,
              'cursor-pointer transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand-cloud-blue focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-gray-900',
            )}
            aria-label={`Open “${alt}” in the photo gallery`}
          >
            {tile}
          </button>
        ) : (
          <div key={image._id} className={tileClassName}>
            {tile}
          </div>
        )
      })}
    </div>
  )
}
