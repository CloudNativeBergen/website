'use client'

import { useState } from 'react'
import { PhotoIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
// Deep import on purpose: the gallery barrel pulls in the uploader
// (react-dropzone), the hotspot editor and the Sanity client.
import { EditionSelect } from '@/components/admin/gallery/EditionSelect'
import { PhotoGalleryWithDownload } from './PhotoGalleryWithDownload'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type { ConferenceLogos } from '../common/DashboardLayout'

interface StudioPhotoGalleryProps {
  /** The CURRENT edition's featured photos, read on the server. */
  photos: GalleryImageWithSpeakers[]
  qrCodeUrl?: string
  conferenceTitle: string
  conferenceLogos?: ConferenceLogos
}

/**
 * The studio's photo-gallery tab (#1191): the current edition's featured
 * photos by default, or — a new edition is promoted with last year's pictures
 * long before it has its own — a previous edition's, chosen from the editions
 * the server lists. The collage itself is unchanged.
 */
export function StudioPhotoGallery({
  photos,
  qrCodeUrl,
  conferenceTitle,
  conferenceLogos,
}: StudioPhotoGalleryProps) {
  const [edition, setEdition] = useState<string | undefined>()
  const editions = api.gallery.admin.editions.useQuery()
  const previous = api.gallery.admin.list.useQuery(
    { edition, featured: true, limit: 100, offset: 0 },
    { enabled: Boolean(edition) },
  )
  const shown = edition ? (previous.data ?? []) : photos
  const loading = Boolean(edition) && previous.isLoading
  const editionTitle = editions.data?.previous.find(
    (e) => e._id === edition,
  )?.title

  return (
    <div className="space-y-4">
      <EditionSelect
        id="studio-photo-gallery-edition"
        editions={editions.data}
        value={edition}
        onChange={setEdition}
        className="max-w-xs"
      />
      {loading ? (
        <div className="h-64 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      ) : edition && previous.isError ? (
        <div
          role="alert"
          className="py-12 text-center text-sm text-red-700 dark:text-red-400"
        >
          {previous.error.message || 'Failed to load that edition’s photos'}
        </div>
      ) : shown.length === 0 ? (
        <div className="py-12 text-center">
          <PhotoIcon className="mx-auto mb-4 size-12 text-gray-400 dark:text-gray-500" />
          <h3 className="font-space-grotesk mb-2 text-xl font-semibold text-gray-900 dark:text-white">
            {editionTitle ? 'No Featured Photos' : 'No Featured Photos Yet'}
          </h3>
          <p className="font-inter text-gray-600 dark:text-gray-400">
            {editionTitle
              ? `${editionTitle} has no featured photos. Feature some in that edition’s admin gallery first.`
              : 'Featured photo galleries will appear here once photos are uploaded and marked as featured.'}
            {!editionTitle && editions.data && editions.data.previous.length > 0
              ? ' Pick a previous edition above to build a collage from its pictures.'
              : ''}
          </p>
        </div>
      ) : (
        <PhotoGalleryWithDownload
          photos={shown}
          qrCodeUrl={qrCodeUrl}
          conferenceTitle={conferenceTitle}
          conferenceLogos={conferenceLogos}
        />
      )}
    </div>
  )
}
