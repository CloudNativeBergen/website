'use client'

import { useState } from 'react'
import { PhotoIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import type { BackgroundGallery, GalleryImage } from './meme-generator-gallery'

type Listing =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; images: GalleryImage[] }

/**
 * "Choose from gallery": the organization's images, one click to make one
 * the scene's background. Only the id leaves here; what is drawn is whatever
 * the gallery resolves it to.
 */
export function BackgroundGalleryPicker({
  gallery,
  onPick,
  disabled = false,
}: {
  gallery: BackgroundGallery
  onPick: (id: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [listing, setListing] = useState<Listing>({ state: 'loading' })

  // Read afresh on every open: an image added on the Assets page since shows.
  const show = () => {
    setOpen(true)
    setListing({ state: 'loading' })
    gallery.images().then(
      (images) => setListing({ state: 'ready', images }),
      () => setListing({ state: 'failed' }),
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-cloud-blue/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
      >
        <PhotoIcon className="size-4" aria-hidden="true" />
        Choose from gallery
      </button>
      <ModalShell
        isOpen={open}
        onClose={() => setOpen(false)}
        size="3xl"
        title="Choose a background"
        subtitle="Images from this organization’s marketing gallery."
        icon={<PhotoIcon />}
      >
        {listing.state === 'loading' && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Loading the gallery…
          </p>
        )}
        {listing.state === 'failed' && (
          <p
            role="alert"
            className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200"
          >
            The gallery could not be loaded. Close this and try again.
          </p>
        )}
        {listing.state === 'ready' && listing.images.length === 0 && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            There are no images in the gallery yet. Add them on the Assets page,
            or keep an uploaded background.
          </p>
        )}
        {listing.state === 'ready' && listing.images.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {listing.images.map((image) => (
              <li key={image._id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onPick(image._id)
                  }}
                  className="group block w-full overflow-hidden rounded-lg border border-gray-200 text-left hover:border-brand-cloud-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:border-gray-700 dark:hover:border-blue-400"
                >
                  <span className="flex aspect-square items-center justify-center bg-gray-100 dark:bg-gray-800">
                    {image.thumbnailUrl ? (
                      // A plain <img>: shown only, never drawn on the canvas.
                      <img
                        src={image.thumbnailUrl}
                        alt={image.alt}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <PhotoIcon
                        className="size-10 text-gray-400 dark:text-gray-500"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="block truncate px-2 py-1.5 text-sm text-gray-800 group-hover:text-brand-cloud-blue dark:text-gray-100 dark:group-hover:text-blue-300">
                    {image.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ModalShell>
    </>
  )
}
