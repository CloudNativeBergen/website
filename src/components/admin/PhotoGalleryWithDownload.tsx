'use client'

import { PhotoGalleryBuilder } from './PhotoGalleryBuilder'
import { DownloadableImage } from '../common/DownloadableImage'
import { PLATFORM_SLUG } from '@/lib/branding/platform'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type { ConferenceLogos } from '../common/DashboardLayout'

interface PhotoGalleryWithDownloadProps {
  photos: GalleryImageWithSpeakers[]
  qrCodeUrl?: string
  conferenceTitle: string
  conferenceLogos?: ConferenceLogos
}

export function PhotoGalleryWithDownload({
  photos,
  qrCodeUrl,
  conferenceTitle,
  conferenceLogos,
}: PhotoGalleryWithDownloadProps) {
  const filename = `${conferenceTitle.replace(/\s+/g, '-').toLowerCase() || PLATFORM_SLUG}-photo-gallery`

  return (
    <PhotoGalleryBuilder
      photos={photos}
      qrCodeUrl={qrCodeUrl}
      conferenceTitle={conferenceTitle}
      conferenceLogos={conferenceLogos}
      wrapPreview={(node) => (
        <DownloadableImage filename={filename}>{node}</DownloadableImage>
      )}
    />
  )
}
