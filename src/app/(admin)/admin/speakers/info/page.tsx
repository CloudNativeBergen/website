import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isUnknownHost } from '@/lib/conference/guard'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { SpeakerInfoForm } from '@/components/admin/SpeakerInfoForm'

export default async function AdminSpeakerInfoPage() {
  const { conference, error } = await getConferenceForCurrentDomain({})

  if (error) {
    return (
      <ErrorDisplay title="Error Loading Conference" message={error.message} />
    )
  }

  if (isUnknownHost({ conference })) {
    return (
      <ErrorDisplay
        title="No Conference Found"
        message="No conference configuration found for the current domain."
      />
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Speaker Info"
        description="Practical information for speakers: the dinner, check-in, equipment and who to call on site. Blank sections are not shown."
        icon={<InformationCircleIcon className="h-6 w-6" />}
        backLink={{ href: '/admin/speakers', label: 'Back to Speakers' }}
      />
      <SpeakerInfoForm initial={conference.speakerInfo} />
    </div>
  )
}
