'use client'

import { MemeGenerator } from './MemeGenerator'
import { DownloadableImage } from '../common/DownloadableImage'
import { PLATFORM_SLUG } from '@/lib/branding/platform'
import type { ConferenceLogos } from '../common/DashboardLayout'

interface MemeGeneratorWithDownloadProps {
  conferenceTitle?: string
  conferenceLogos?: ConferenceLogos
}

export function MemeGeneratorWithDownload({
  conferenceTitle,
  conferenceLogos,
}: MemeGeneratorWithDownloadProps) {
  const filename = `${conferenceTitle?.replace(/\s+/g, '-').toLowerCase() || PLATFORM_SLUG}-meme`

  return (
    <MemeGenerator
      conferenceLogos={conferenceLogos}
      wrapPreview={(node) => (
        <DownloadableImage filename={filename}>{node}</DownloadableImage>
      )}
    />
  )
}
