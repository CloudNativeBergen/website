'use client'

import { MemeGenerator } from './MemeGenerator'
import { DownloadSpeakerImage } from '../branding/DownloadSpeakerImage'

interface MemeGeneratorWithDownloadProps {
  conferenceTitle?: string
}

export function MemeGeneratorWithDownload({
  conferenceTitle,
}: MemeGeneratorWithDownloadProps) {
  const filename = `${conferenceTitle?.replace(/\s+/g, '-').toLowerCase() || 'cloud-native-bergen'}-meme`

  return (
    <MemeGenerator
      wrapPreview={(node) => (
        <DownloadSpeakerImage filename={filename}>{node}</DownloadSpeakerImage>
      )}
    />
  )
}
