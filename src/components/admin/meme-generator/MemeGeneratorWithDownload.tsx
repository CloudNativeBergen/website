'use client'

import { MemeGenerator } from './MemeGenerator'
import { useStudioGallery } from './useStudioGallery'
import type { BackgroundGallery } from './meme-generator-gallery'
import { DownloadableImage } from '../../common/DownloadableImage'
import { PLATFORM_SLUG } from '@/lib/branding/platform'
import type { ConferenceLogos } from '../../common/DashboardLayout'

interface MemeGeneratorWithDownloadProps {
  conferenceTitle?: string
  conferenceLogos?: ConferenceLogos
  /**
   * The organization whose marketing gallery backgrounds come from and are
   * kept in. Without it, backgrounds are local files only.
   */
  orgId?: string
}

export function MemeGeneratorWithDownload({
  orgId,
  ...props
}: MemeGeneratorWithDownloadProps) {
  return orgId ? (
    <WithGallery orgId={orgId} {...props} />
  ) : (
    <Generator {...props} />
  )
}

function WithGallery({
  orgId,
  ...props
}: MemeGeneratorWithDownloadProps & { orgId: string }) {
  const gallery = useStudioGallery(orgId)
  return <Generator {...props} gallery={gallery} />
}

function Generator({
  conferenceTitle,
  conferenceLogos,
  gallery,
}: Omit<MemeGeneratorWithDownloadProps, 'orgId'> & {
  gallery?: BackgroundGallery
}) {
  const filename = `${conferenceTitle?.replace(/\s+/g, '-').toLowerCase() || PLATFORM_SLUG}-meme`

  return (
    <MemeGenerator
      conferenceLogos={conferenceLogos}
      gallery={gallery}
      wrapPreview={(node) => (
        <DownloadableImage filename={filename}>{node}</DownloadableImage>
      )}
    />
  )
}
