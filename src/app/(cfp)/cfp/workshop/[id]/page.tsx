import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getAuthSession } from '@/lib/auth'
import { getSpeaker } from '@/lib/speaker/sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { BackLink } from '@/components/BackButton'
import type { WorkshopSignupExisting } from '@/lib/workshop/types'
import type { Speaker } from '@/lib/speaker/types'

export const dynamic = 'force-dynamic'

interface WorkshopDetailsPageProps {
  params: Promise<{ id: string }>
}

interface WorkshopDetails {
  _id: string
  title: string
  format: string
  level: string
  language: string
  description: unknown[]
  capacity?: number
  date?: string
  startTime?: string
  endTime?: string
  room?: string
  speakers?: Speaker[]
}

export default async function WorkshopDetailsPage({
  params,
}: WorkshopDetailsPageProps) {
  const { id: workshopId } = await params
  const headersList = await headers()
  const fullUrl = headersList.get('x-url') || ''
  const session = await getAuthSession({ url: fullUrl })

  if (!session?.speaker) {
    return redirect(`/api/auth/signin?callbackUrl=/cfp/workshop/${workshopId}`)
  }

  const { speaker: currentSpeaker, err: speakerError } = await getSpeaker(
    session.speaker._id,
  )

  if (speakerError || !currentSpeaker) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Workshop Details
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            View participant information for your workshop
          </p>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800/50 dark:bg-red-900/20">
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
            Error Loading Speaker
          </h3>
          <p className="mt-2 text-red-700 dark:text-red-300">
            Failed to load your speaker profile.
          </p>
        </div>
      </div>
    )
  }

  const workshop = await clientReadUncached.fetch<WorkshopDetails | null>(
    groq`*[_type == "talk" && _id == $workshopId && format in ["workshop_120", "workshop_240"]][0] {
      _id,
      title,
      format,
      level,
      language,
      description,
      capacity,
      date,
      startTime,
      endTime,
      room,
      "speakers": speakers[]->{ _id, name, email, organization }
    }`,
    { workshopId },
  )

  if (!workshop) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Workshop Details
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            View participant information for your workshop
          </p>
        </div>

        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 dark:border-yellow-800/50 dark:bg-yellow-900/20">
          <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200">
            Workshop Not Found
          </h3>
          <p className="mt-2 text-yellow-700 dark:text-yellow-300">
            The workshop you&apos;re looking for could not be found.
          </p>
        </div>
      </div>
    )
  }

  const isSpeaker = workshop.speakers?.some(
    (s: Speaker | string) =>
      typeof s === 'object' && s !== null && s._id === currentSpeaker._id,
  )

  const isImpersonatingAsOrganizer =
    session.isImpersonating && session.realAdmin?.is_organizer

  if (!isSpeaker && !isImpersonatingAsOrganizer) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Workshop Details
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            View participant information for your workshop
          </p>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800/50 dark:bg-red-900/20">
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
            Access Denied
          </h3>
          <p className="mt-2 text-red-700 dark:text-red-300">
            You don&apos;t have permission to view participants for this
            workshop. Only workshop speakers can view participant information.
          </p>
        </div>
      </div>
    )
  }

  const signups = await clientReadUncached.fetch<WorkshopSignupExisting[]>(
    groq`*[_type == "workshopSignup" && workshop._ref == $workshopId && status in ["confirmed", "waitlist"]] | order(signedUpAt asc) {
      _id,
      userName,
      experienceLevel,
      operatingSystem,
      status,
      signedUpAt
    }`,
    { workshopId },
  )

  const confirmedSignups = signups.filter(
    (s: WorkshopSignupExisting) => s.status === 'confirmed',
  )
  const waitlistSignups = signups.filter(
    (s: WorkshopSignupExisting) => s.status === 'waitlist',
  )

  const formatDuration = (format: string) => {
    if (format === 'workshop_120') return '2 hours'
    if (format === 'workshop_240') return '4 hours'
    return format
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <BackLink fallbackUrl="/cfp" />

      <div className="mt-6 mb-6">
        <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          {workshop.title}
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Workshop participant information
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Workshop Details
          </h2>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600 dark:text-gray-400">Duration:</dt>
              <dd className="font-medium text-gray-900 dark:text-white">
                {formatDuration(workshop.format)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600 dark:text-gray-400">Level:</dt>
              <dd className="font-medium text-gray-900 dark:text-white">
                {workshop.level}
              </dd>
            </div>
            {workshop.capacity && (
              <div className="flex justify-between">
                <dt className="text-gray-600 dark:text-gray-400">Capacity:</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {workshop.capacity} participants
                </dd>
              </div>
            )}
            {workshop.date && (
              <div className="flex justify-between">
                <dt className="text-gray-600 dark:text-gray-400">Date:</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {workshop.date}
                </dd>
              </div>
            )}
            {workshop.startTime && workshop.endTime && (
              <div className="flex justify-between">
                <dt className="text-gray-600 dark:text-gray-400">Time:</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {workshop.startTime} - {workshop.endTime}
                </dd>
              </div>
            )}
            {workshop.room && (
              <div className="flex justify-between">
                <dt className="text-gray-600 dark:text-gray-400">Room:</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {workshop.room}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Confirmed Participants */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Confirmed Participants
            </h2>
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
              {confirmedSignups.length}
              {workshop.capacity ? ` / ${workshop.capacity}` : ''}
            </span>
          </div>

          {confirmedSignups.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              No confirmed participants yet.
            </p>
          ) : (
            <div className="mt-4 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                      Name
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                      Experience
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                      OS
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {confirmedSignups.map((signup: WorkshopSignupExisting) => (
                    <tr key={signup._id}>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-900 dark:text-white">
                        {signup.userName}
                      </td>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-600 dark:text-gray-400">
                        {signup.experienceLevel}
                      </td>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-600 dark:text-gray-400">
                        {signup.operatingSystem === 'macos'
                          ? 'macOS'
                          : signup.operatingSystem.charAt(0).toUpperCase() +
                            signup.operatingSystem.slice(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Waitlist */}
        {waitlistSignups.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Waitlist
              </h2>
              <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                {waitlistSignups.length}
              </span>
            </div>

            <div className="mt-4 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                      Name
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                      Experience
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                      OS
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {waitlistSignups.map((signup: WorkshopSignupExisting) => (
                    <tr key={signup._id}>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-900 dark:text-white">
                        {signup.userName}
                      </td>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-600 dark:text-gray-400">
                        {signup.experienceLevel}
                      </td>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-600 dark:text-gray-400">
                        {signup.operatingSystem === 'macos'
                          ? 'macOS'
                          : signup.operatingSystem.charAt(0).toUpperCase() +
                            signup.operatingSystem.slice(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Privacy Notice */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/50 dark:bg-blue-900/20">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Privacy Notice:</strong> This information is only visible to
            workshop speakers. Participant names, experience levels, and
            operating systems are shown to help you prepare appropriate content.
            Email addresses and other personal information are not displayed to
            protect participant privacy.
          </p>
        </div>
      </div>
    </div>
  )
}
