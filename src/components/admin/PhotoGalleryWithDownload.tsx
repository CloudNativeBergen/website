'use client'

import { PhotoGalleryBuilder } from './PhotoGalleryBuilder'
import { DownloadSpeakerImage } from '../branding/DownloadSpeakerImage'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

interface PhotoGalleryWithDownloadProps {
  photos: GalleryImageWithSpeakers[]
  qrCodeUrl?: string
  conferenceTitle: string
}

export function PhotoGalleryWithDownload({
  photos,
  qrCodeUrl,
  conferenceTitle,
}: PhotoGalleryWithDownloadProps) {
  const filename = `${conferenceTitle.replace(/\s+/g, '-').toLowerCase() || 'cloud-native-bergen'}-photo-gallery`

  return (
    <PhotoGalleryBuilder
      photos={photos}
      qrCodeUrl={qrCodeUrl}
      conferenceTitle={conferenceTitle}
      wrapPreview={(node) => (
        <DownloadSpeakerImage filename={filename}>{node}</DownloadSpeakerImage>
      )}
    />
  )
}
