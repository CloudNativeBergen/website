'use client'

import React, { useState, useEffect } from 'react'
import { ImageCarousel } from '@/components/ImageCarousel'
import { GalleryModal } from '@/components/GalleryModal'
import { Container } from '@/components/Container'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { cn } from '@/lib/utils'

interface ImageGalleryProps {
  featuredImages?: GalleryImageWithSpeakers[]
  allImages?: GalleryImageWithSpeakers[]
  className?: string
}

export function ImageGallery({
  featuredImages = [],
  allImages = [],
  className,
}: ImageGalleryProps) {
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

  return (
    <section className={cn('py-16 sm:py-24', className)}>
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-space-grotesk text-3xl font-bold tracking-tight text-brand-slate-gray sm:text-4xl dark:text-white">
            Conference Moments
          </h2>
          <p className="mt-4 text-lg text-brand-slate-gray/80 dark:text-gray-300">
            Relive the energy and excitement from our past events. Browse
            through captured moments featuring speakers, attendees, and the
            vibrant community atmosphere.
          </p>
        </div>

        <div className="mt-12">
          <ImageCarousel
            images={featured}
            autoPlay={true}
            showThumbnails={false}
            onFullscreenClick={
              allImages.length > 0 ? handleViewGallery : undefined
            }
            className="mx-auto"
          />
        </div>

        {allImages.length > 0 && (
          <GalleryModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            images={allImages}
            initialIndex={modalInitialIndex}
          />
        )}
      </Container>
    </section>
  )
}
