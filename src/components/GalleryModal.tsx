'use client'

import React, { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { useImageCarousel } from '@/hooks/useImageCarousel'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface GalleryModalProps {
  isOpen: boolean
  onClose: () => void
  images: GalleryImageWithSpeakers[]
  initialIndex?: number
}

export function GalleryModal({
  isOpen,
  onClose,
  images,
  initialIndex = 0,
}: GalleryModalProps) {
  const {
    currentIndex,
    goToNext,
    goToPrevious,
    goToIndex,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useImageCarousel({
    totalImages: images.length,
    initialIndex: initialIndex,
    enableKeyboard: isOpen,
    enableTouch: true,
    globalKeyboard: isOpen,
    onEscape: onClose,
  })

  if (!images || images.length === 0) {
    return null
  }

  const currentImage = images[currentIndex]

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/95 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="relative h-screen w-screen bg-black">
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between border-b border-gray-800 bg-black/50 px-4 py-3 backdrop-blur-sm sm:px-6">
                    <div className="flex items-center space-x-4">
                      <Dialog.Title className="font-space-grotesk text-lg font-semibold text-white">
                        {currentIndex + 1} of {images.length}
                      </Dialog.Title>
                      {currentImage?.location && (
                        <span className="hidden text-sm text-gray-300/90 sm:block">
                          {currentImage.location}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="rounded-md p-2 text-gray-400 hover:bg-gray-800 hover:text-white focus:ring-2 focus:ring-white focus:outline-none"
                      onClick={onClose}
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="relative flex-1 overflow-hidden">
                    <div
                      className="flex h-full items-center justify-center"
                      onTouchStart={(e) => handleTouchStart(e.nativeEvent)}
                      onTouchMove={(e) => handleTouchMove(e.nativeEvent)}
                      onTouchEnd={handleTouchEnd}
                    >
                      {currentImage?.imageUrl && (
                        <div className="relative h-full w-full">
                          <img
                            src={`${currentImage.imageUrl}?w=1920&q=90&auto=format&fit=max`}
                            alt={
                              currentImage.imageAlt ??
                              (currentImage.photographer
                                ? `Photo by ${currentImage.photographer}`
                                : 'Gallery image')
                            }
                            className="h-full w-full object-contain"
                            loading={
                              isOpen && currentIndex === 0 ? 'eager' : 'lazy'
                            }
                          />
                        </div>
                      )}

                      {images.length > 1 && (
                        <>
                          <button
                            onClick={goToPrevious}
                            className={cn(
                              'absolute top-1/2 left-4 -translate-y-1/2 rounded-full bg-black/50 p-3',
                              'text-white backdrop-blur-sm transition-all hover:bg-black/70',
                              'focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black focus:outline-none',
                            )}
                            aria-label="Previous image"
                          >
                            <ChevronLeftIcon className="h-6 w-6" />
                          </button>

                          <button
                            onClick={goToNext}
                            className={cn(
                              'absolute top-1/2 right-4 -translate-y-1/2 rounded-full bg-black/50 p-3',
                              'text-white backdrop-blur-sm transition-all hover:bg-black/70',
                              'focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black focus:outline-none',
                            )}
                            aria-label="Next image"
                          >
                            <ChevronRightIcon className="h-6 w-6" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-800 bg-black/50 backdrop-blur-sm">
                    <div className="px-4 py-4 sm:px-6">
                      <div className="mb-4 space-y-2">
                        {currentImage?.location && (
                          <h3 className="font-space-grotesk text-xl font-semibold text-white">
                            {currentImage.location}
                          </h3>
                        )}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-300/90">
                          {currentImage?.photographer && (
                            <span>Photo by {currentImage.photographer}</span>
                          )}
                          {currentImage?.date &&
                            (() => {
                              const date = new Date(currentImage.date)
                              if (!isNaN(date.getTime())) {
                                return (
                                  <span>
                                    {date.toLocaleDateString('en-US', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                    })}
                                  </span>
                                )
                              }
                              return null
                            })()}
                          {currentImage?.location && (
                            <span>{currentImage.location}</span>
                          )}
                        </div>
                        {currentImage?.speakers &&
                          currentImage.speakers.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2">
                              {currentImage.speakers.map((speaker) =>
                                speaker.slug ? (
                                  <Link
                                    key={speaker._id}
                                    href={`/speaker/${speaker.slug}`}
                                    className="rounded-full bg-brand-cloud-blue/20 px-3 py-1 text-xs font-medium text-brand-cloud-blue transition-colors hover:bg-brand-cloud-blue/30"
                                  >
                                    {speaker.name}
                                  </Link>
                                ) : (
                                  <span
                                    key={speaker._id}
                                    className="rounded-full bg-brand-cloud-blue/20 px-3 py-1 text-xs font-medium text-brand-cloud-blue"
                                  >
                                    {speaker.name}
                                  </span>
                                ),
                              )}
                            </div>
                          )}
                      </div>

                      <div className="overflow-x-auto">
                        <div className="flex space-x-2 pb-2">
                          {images.map((image, index) => (
                            <button
                              key={image._id}
                              onClick={() => goToIndex(index)}
                              className={cn(
                                'relative h-16 w-24 flex-shrink-0 overflow-hidden rounded',
                                'transition-all hover:opacity-100',
                                index === currentIndex
                                  ? 'ring-2 ring-white ring-offset-2 ring-offset-black'
                                  : 'opacity-50',
                              )}
                            >
                              {image.imageUrl && (
                                <img
                                  src={`${image.imageUrl}?w=192&h=128&q=85&auto=format&fit=crop`}
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
                    </div>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
