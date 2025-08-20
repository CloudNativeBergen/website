'use client';

import React, { useState } from 'react';
import { ImageCarousel } from '@/components/ImageCarousel';
import { GalleryModal } from '@/components/GalleryModal';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import { GalleryImageWithSpeakers } from '@/lib/gallery/types';
import { cn } from '@/lib/utils';

interface ImageGalleryProps {
  featuredImages?: GalleryImageWithSpeakers[];
  allImages?: GalleryImageWithSpeakers[];
  className?: string;
}

export function ImageGallery({
  featuredImages = [],
  allImages = [],
  className,
}: ImageGalleryProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);

  // Use featured images if available, otherwise use first 8 images as fallback
  const featured = featuredImages.length ? featuredImages : allImages.slice(0, 8);

  if (!featured || featured.length === 0) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleImageClick = (image: GalleryImageWithSpeakers, _index: number) => {
    const fullIndex = allImages.findIndex((img) => img._id === image._id);
    setModalInitialIndex(fullIndex !== -1 ? fullIndex : 0);
    setIsModalOpen(true);
  };

  const handleViewGallery = () => {
    setModalInitialIndex(0);
    setIsModalOpen(true);
  };

  return (
    <section className={cn('py-16 sm:py-24', className)}>
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-space-grotesk text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Conference Moments
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Relive the energy and excitement from our past events. Browse through captured moments
            featuring speakers, attendees, and the vibrant community atmosphere.
          </p>
        </div>

        <div className="mt-12">
          <ImageCarousel
            images={featured}
            autoPlay={true}
            showThumbnails={false}
            onImageClick={allImages.length > 0 ? handleImageClick : undefined}
            className="mx-auto"
          />
        </div>

        {allImages.length > 0 && (
          <div className="mt-12 text-center">
            <Button
              onClick={handleViewGallery}
              variant="primary"
              className="inline-flex"
            >
              View Full Gallery
            </Button>
          </div>
        )}

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
  );
}