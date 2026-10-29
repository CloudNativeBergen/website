import { SPONSOR_PAGE_TITLES } from '@/lib/sponsor-crm/labels'
import { Suspense } from 'react'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import { SponsorActivityLog } from '@/components/admin/sponsor/SponsorActivityLog'

export const metadata = { title: SPONSOR_PAGE_TITLES.activity }

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
        title={SPONSOR_PAGE_TITLES.activity}
        description="Complete history of sponsor activities for"
        contextHighlight={conference.title}
        backLink={{ href: '/admin/sponsors', label: 'Back to Dashboard' }}
      />

      <Suspense>
        <SponsorActivityLog />
      </Suspense>
    </div>
  )
}
