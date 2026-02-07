import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline'

export default async function AdminSponsorActivity() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({})

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
      />
    )
  }

  if (!conference) {
    return (
      <ErrorDisplay
        title="No Conference Found"
        message="No conference found for current domain"
      />
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<ClipboardDocumentListIcon />}
        title="Activity Log"
        description="Complete history of sponsor activities for"
        contextHighlight={conference.title}
        backLink={{ href: '/admin/sponsors', label: 'Back to Dashboard' }}
      />

      <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-600 dark:bg-gray-800">
        <p className="text-gray-600 dark:text-gray-400">
          Full activity log with filters and pagination coming soon
        </p>
      </div>
    </div>
  )
}
