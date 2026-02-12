'use client'

import { MemeGenerator } from './MemeGenerator'
import { DownloadableImage } from '../common/DownloadableImage'
import type { ConferenceLogos } from '../common/DashboardLayout'

interface MemeGeneratorWithDownloadProps {
  conferenceTitle?: string
  conferenceLogos?: ConferenceLogos
}

export function MemeGeneratorWithDownload({
  conferenceTitle,
  conferenceLogos,
}: MemeGeneratorWithDownloadProps) {
  const filename = `${conferenceTitle?.replace(/\s+/g, '-').toLowerCase() || 'cloud-native-bergen'}-meme`

  return (
    <MemeGenerator
      conferenceLogos={conferenceLogos}
      wrapPreview={(node) => (
        <DownloadableImage filename={filename}>{node}</DownloadableImage>
      )}
    />
  )
}
