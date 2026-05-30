import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { AgentConfigPageClient } from '@/components/admin/AgentConfigPage'

export default async function AdminAgentsPage() {
  const { conference, error } = await getConferenceForCurrentDomain()

  if (error || !conference) {
    return (
      <ErrorDisplay
        title="Conference Not Found"
        message={error?.message || 'Could not load conference data'}
      />
    )
  }

  return <AgentConfigPageClient />
}
