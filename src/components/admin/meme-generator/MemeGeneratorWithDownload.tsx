'use client'

import { MemeGenerator } from './MemeGenerator'
import { useStudioGallery } from './useStudioGallery'
import { useStudioProjects } from './useStudioProjects'
import type { VideoProjects } from './meme-generator-project'
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
  /** A saved video to open on arrival (`?project=` in the studio's URL). */
  projectId?: string
}

/**
 * Keep the studio's URL on the open project, so a reload or a shared link
 * reopens it. `replaceState`, not a navigation: the page is not re-rendered.
 */
function showProjectInUrl(id: string | null) {
  const url = new URL(window.location.href)
  if (id) {
    url.searchParams.set('project', id)
    url.searchParams.set('tab', 'meme-generator')
  } else url.searchParams.delete('project')
  window.history.replaceState(window.history.state, '', url)
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
  const projects = useStudioProjects()
  return <Generator {...props} gallery={gallery} projects={projects} />
}

function Generator({
  conferenceTitle,
  conferenceLogos,
  gallery,
  projects,
  projectId,
}: Omit<MemeGeneratorWithDownloadProps, 'orgId'> & {
  gallery?: BackgroundGallery
  projects?: VideoProjects
}) {
  const filename = `${conferenceTitle?.replace(/\s+/g, '-').toLowerCase() || PLATFORM_SLUG}-meme`

  return (
    <MemeGenerator
      conferenceLogos={conferenceLogos}
      gallery={gallery}
      projects={projects}
      initialProjectId={projects ? projectId : undefined}
      onProjectChange={showProjectInUrl}
      wrapPreview={(node) => (
        <DownloadableImage filename={filename}>{node}</DownloadableImage>
      )}
    />
  )
}
