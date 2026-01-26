'use client'

import { MemeGenerator } from './MemeGenerator'
import { DownloadSpeakerImage } from '../branding/DownloadSpeakerImage'
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
        <DownloadSpeakerImage filename={filename}>{node}</DownloadSpeakerImage>
      )}
    />
  )
}
