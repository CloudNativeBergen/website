'use client'

import { PhotoGalleryBuilder } from './PhotoGalleryBuilder'
import { DownloadSpeakerImage } from '../branding/DownloadSpeakerImage'
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
  const filename = `${conferenceTitle.replace(/\s+/g, '-').toLowerCase() || 'cloud-native-bergen'}-photo-gallery`

  return (
    <PhotoGalleryBuilder
      photos={photos}
      qrCodeUrl={qrCodeUrl}
      conferenceTitle={conferenceTitle}
      conferenceLogos={conferenceLogos}
      wrapPreview={(node) => (
        <DownloadSpeakerImage filename={filename}>{node}</DownloadSpeakerImage>
      )}
    />
  )
}
