import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { SponsorCRMClient } from './SponsorCRMClient'
import Link from 'next/link'

export default async function AdminSponsorsCRM() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      revalidate: 0,
    })

  if (conferenceError || !conference) {
    return (
      <ErrorDisplay
        title="Conference Not Found"
        message={conferenceError?.message || 'Could not load conference data'}
      />
    )
  }

  return (
    <div className="space-y-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex gap-2">
          <Link
            href="/admin/sponsors"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-brand-slate-gray hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Active Sponsors
          </Link>
          <Link
            href="/admin/sponsors/crm"
            className="rounded-lg border border-brand-cloud-blue bg-brand-cloud-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-cloud-blue-hover dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            Pipeline / CRM
          </Link>
        </div>
      </div>

      <AdminPageHeader
        title="Sponsor Pipeline"
        description={`Manage sponsor relationships and track deals for ${conference.title}`}
        icon={undefined}
      />

      <SponsorCRMClient conferenceId={conference._id} />
    </div>
  )
}
