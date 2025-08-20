'use client';

import React, { useState, useMemo } from 'react';
import { ImageCarousel } from '@/components/ImageCarousel';
import { GalleryModal } from '@/components/GalleryModal';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import { GalleryImageWithSpeakers } from '@/lib/gallery/types';
import { cn } from '@/lib/utils';
import { CameraIcon, CalendarIcon } from '@heroicons/react/24/outline';

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

  const recentImages = useMemo(() => 
    [...allImages]
      .sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
      })
      .slice(0, 5),
    [allImages]
  );

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
            className="mx-auto max-w-5xl"
          />
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-cloud-blue/10">
              <CameraIcon className="h-5 w-5 text-brand-cloud-blue" />
            </div>
            <div>
              <p className="font-space-grotesk text-2xl font-bold text-gray-900">
                {allImages.length}
              </p>
              <p className="text-sm text-gray-600">Total images</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-fresh-green/10">
              <CalendarIcon className="h-5 w-5 text-brand-fresh-green" />
            </div>
            <div>
              <p className="font-space-grotesk text-2xl font-bold text-gray-900">
                {recentImages.length}
              </p>
              <p className="text-sm text-gray-600">Latest 5</p>
            </div>
          </div>

          {allImages.length > 0 && (
            <div className="sm:col-span-2 lg:col-span-1">
              <Button
                onClick={handleViewGallery}
                variant="primary"
                className="w-full sm:w-auto"
              >
                View Full Gallery
              </Button>
            </div>
          )}
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
  );
}