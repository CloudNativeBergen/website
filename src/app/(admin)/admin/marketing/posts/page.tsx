import { ErrorDisplay } from '@/components/admin'
import { denyNonOrganizer } from '@/lib/authz/page-guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { PostsPage } from './PostsPage'

export default async function AdminMarketingPostsPage() {
  const denied = await denyNonOrganizer()
  if (denied) return denied
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference) {
    return (
      <ErrorDisplay
        title="Conference Not Found"
        message={error?.message || 'Could not load conference data'}
      />
    )
  }
  return <PostsPage />
}
