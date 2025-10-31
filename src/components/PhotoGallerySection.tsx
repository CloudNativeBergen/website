'use client'

import { useState } from 'react'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { PhotoBentoGrid } from '@/components/PhotoBentoGrid'
import { SimpleImageCarousel } from '@/components/SimpleImageCarousel'
import { GalleryModal } from '@/components/GalleryModal'

interface PhotoGallerySectionProps {
  images: GalleryImageWithSpeakers[]
}

export function PhotoGallerySection({ images }: PhotoGallerySectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)

  if (!images || images.length === 0) {
    return null
  }

  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index)
    setIsModalOpen(true)
  }

  return (
    <>
      <div className="mb-8">
        <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
          Photos
        </h2>
        <PhotoBentoGrid images={images} onImageClick={handleImageClick} />
        <SimpleImageCarousel images={images} onImageClick={handleImageClick} />
      </div>

      <GalleryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        images={images}
        initialIndex={selectedImageIndex}
      />
    </>
  )
}
