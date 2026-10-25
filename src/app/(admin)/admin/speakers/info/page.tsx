import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isUnknownHost } from '@/lib/conference/guard'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { SpeakerInfoForm } from '@/components/admin/SpeakerInfoForm'
import { getSpeakerInfoGaps } from '@/lib/speaker/briefing-checklist'

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

  const gaps = getSpeakerInfoGaps(conference.speakerInfo)
  const oldDinner = conference.speakerDinnerInfo?.trim()

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Speaker Info"
        description="Practical information for speakers: the dinner, check-in, equipment and who to call on site. Blank sections are not shown."
        icon={<InformationCircleIcon className="h-6 w-6" />}
        backLink={{ href: '/admin/speakers', label: 'Back to Speakers' }}
      />
      {gaps.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
          <p className="font-medium">Missing information</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      <SpeakerInfoForm initial={conference.speakerInfo} />
      {oldDinner && (
        <div className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-700">
          <p className="font-medium text-gray-900 dark:text-white">
            Old dinner text, used only while the fields above are empty
          </p>
          <p className="mt-2 whitespace-pre-line text-gray-600 dark:text-gray-400">
            {oldDinner}
          </p>
        </div>
      )}
    </div>
  )
}
