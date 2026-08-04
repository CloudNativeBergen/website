'use client'

import React, { useState, useEffect } from 'react'
import { ImageCarousel } from '@/components/ImageCarousel'
import { ImageMosaic } from '@/components/ImageMosaic'
import { GalleryModal } from '@/components/GalleryModal'
import { Container } from '@/components/Container'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import {
  DEFAULT_GALLERY_DESCRIPTION,
  DEFAULT_GALLERY_HEADING,
} from '@/lib/homepage/sections'
import { resolveVariant, type SectionVariant } from '@/lib/homepage/variants'
import { cn } from '@/lib/utils'

interface ImageGalleryProps {
  featuredImages?: GalleryImageWithSpeakers[]
  allImages?: GalleryImageWithSpeakers[]
  /** Band heading. Defaults to the house copy (`homepageGallery` config). */
  heading?: string
  /** Band sub-heading. Defaults to the house copy. */
  description?: string
  /**
   * Presentation variant. ABSENT = `carousel`, the pre-variant rendering, so
   * every existing caller keeps exactly the band it has today.
   */
  variant?: SectionVariant<'homepageGallery'>
  className?: string
}

export function ImageGallery({
  featuredImages = [],
  allImages = [],
  heading = DEFAULT_GALLERY_HEADING,
  description = DEFAULT_GALLERY_DESCRIPTION,
  variant,
  className,
}: ImageGalleryProps) {
  const resolvedVariant = resolveVariant('homepageGallery', variant)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalInitialIndex, setModalInitialIndex] = useState(0)

  useEffect(() => {
    const handleHashChange = () => {
      if (typeof window === 'undefined') return

      const hash = window.location.hash
      if (hash.startsWith('#gallery')) {
        const params = new URLSearchParams(hash.split('?')[1] || '')
        const imageId = params.get('img')

        if (imageId && allImages.length > 0) {
          const imageIndex = allImages.findIndex((img) => img._id === imageId)
          if (imageIndex !== -1) {
            setModalInitialIndex(imageIndex)
            setIsModalOpen(true)
          }
        }
      }
    }

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [allImages])

  const featured = featuredImages.length
    ? featuredImages
    : allImages.slice(0, 8)

  if (!featured || featured.length === 0) {
    return null
  }

  const handleViewGallery = () => {
    setModalInitialIndex(0)
    setIsModalOpen(true)
  }

  const hasAllImages = allImages.length > 0

  /**
   * The lightbox source. The carousel keeps its rule exactly — it only offers
   * the fullscreen jump when a FULL gallery exists behind the featured strip.
   * The mosaic falls back to the featured set, because on the front page
   * `allImages` is never passed (the renderer hands over
   * `conference.featuredGalleryImages` only), and a wall of photos that does
   * nothing when tapped is a dead end rather than a design.
   */
  const isMosaic = resolvedVariant === 'mosaic'
  const modalImages = hasAllImages ? allImages : featured

  const handleMosaicImageClick = (index: number) => {
    const clicked = featured[index]
    const target = modalImages.findIndex((img) => img._id === clicked?._id)
    setModalInitialIndex(target >= 0 ? target : 0)
    setIsModalOpen(true)
  }

  return (
    <section className={cn('py-16 sm:py-24', className)}>
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-space-grotesk text-3xl font-bold tracking-tight text-brand-slate-gray sm:text-4xl dark:text-white">
            {heading}
          </h2>
          <p className="mt-4 text-lg text-brand-slate-gray/80 dark:text-gray-300">
            {description}
          </p>
        </div>

        <div className="mt-12">
          {isMosaic ? (
            <ImageMosaic
              images={featured}
              onImageClick={handleMosaicImageClick}
            />
          ) : (
            <ImageCarousel
              images={featured}
              autoPlay={true}
              showThumbnails={false}
              onFullscreenClick={hasAllImages ? handleViewGallery : undefined}
              className="mx-auto"
            />
          )}
        </div>

        {(hasAllImages || isMosaic) && (
          <GalleryModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            images={modalImages}
            initialIndex={modalInitialIndex}
          />
        )}
      </Container>
    </section>
  )
}
