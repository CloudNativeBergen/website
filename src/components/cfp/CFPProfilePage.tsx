'use client'

import { useState, useEffect, useCallback } from 'react'
import { Speaker, SpeakerInput } from '@/lib/speaker/types'
import { api } from '@/lib/trpc/client'
import { SpeakerDetailsForm } from './SpeakerDetailsForm'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { useSpeakerImageUpload } from '@/hooks/useSpeakerImageUpload'

interface CFPProfilePageProps {
  initialSpeaker: Speaker
  conferenceId?: string
}

export function CFPProfilePage({ initialSpeaker }: CFPProfilePageProps) {
  const {
    data: profile,
    error: profileError,
    refetch: refreshProfile,
  } = api.speaker.getCurrent.useQuery(undefined, {
    initialData: initialSpeaker,
    staleTime: 5000, // 5 seconds for authenticated data
  })

  const { data: emails } = api.speaker.getEmails.useQuery(undefined, {
    staleTime: 5000,
  })

  const updateProfileMutation = api.speaker.update.useMutation({
    onSuccess: () => {
      setSuccessMessage('Profile updated successfully!')
      setTimeout(() => setSuccessMessage(''), 3000)
      refreshProfile()
    },
  })

  const [submitError, setSubmitError] = useState<string[]>([])
  const [successMessage, setSuccessMessage] = useState('')

  const speaker = profile || initialSpeaker
  const [speakerData, setSpeakerData] = useState(speaker)

  const { uploadImage, error: uploadError } = useSpeakerImageUpload({
    speakerId: speaker._id,
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync speaker data with profile
    setSpeakerData(profile || initialSpeaker)
  }, [profile, initialSpeaker])

  useEffect(() => {
    if (uploadError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Propagate upload error
      setSubmitError([uploadError])
    }
  }, [uploadError])

  const handleSpeakerDataChange = useCallback(
    (updatedSpeakerInput: SpeakerInput) => {
      setSpeakerData((prev) => ({
        ...prev,
        ...updatedSpeakerInput,
      }))
    },
    [],
  )

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError([])
    setSuccessMessage('')

    updateProfileMutation.mutate(speakerData)
  }

  if (profileError && !profile) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Speaker Profile
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage your speaker information
          </p>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800/50 dark:bg-red-900/20">
          <div className="flex">
            <div className="shrink-0">
              <ExclamationCircleIcon
                className="h-6 w-6 text-red-500 dark:text-red-400"
                aria-hidden="true"
              />
            </div>
            <div className="ml-4">
              <h3 className="font-space-grotesk text-lg font-semibold text-red-800 dark:text-red-200">
                Loading Error: Profile Error
              </h3>
              <div className="font-inter mt-2 text-red-700 dark:text-red-300">
                <p>{profileError?.message || 'Failed to load profile'}</p>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => refreshProfile()}
                  className="font-space-grotesk inline-flex items-center rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-800 transition-colors hover:bg-red-200 focus:outline-2 focus:outline-offset-2 focus:outline-red-500 dark:bg-red-800/30 dark:text-red-200 dark:hover:bg-red-800/50 dark:focus:outline-red-400"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Speaker Profile
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Manage your speaker information and how you appear to attendees
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <form onSubmit={handleProfileSubmit} className="space-y-8">
          {successMessage && (
            <div className="rounded-lg bg-brand-fresh-green/10 p-4 ring-1 ring-brand-fresh-green/20 dark:bg-green-900/20 dark:ring-green-500/30">
              <p className="font-inter text-sm font-medium text-brand-fresh-green dark:text-green-400">
                {successMessage}
              </p>
            </div>
          )}

          {submitError.length > 0 && (
            <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-900/20 dark:ring-red-500/30">
              <div className="flex">
                <div className="shrink-0">
                  <ExclamationCircleIcon
                    className="h-5 w-5 text-red-400 dark:text-red-500"
                    aria-hidden="true"
                  />
                </div>
                <div className="ml-3">
                  <h3 className="font-space-grotesk text-sm font-medium text-red-800 dark:text-red-200">
                    Please fix the following errors:
                  </h3>
                  <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                    <ul className="font-inter list-disc space-y-1 pl-5">
                      {submitError.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
              Email Address
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="email"
                value={emails?.[0]?.email || speaker.email || ''}
                className="block flex-1 rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10"
                disabled
                readOnly
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Managed by your OAuth provider
              </span>
            </div>
          </div>

          <SpeakerDetailsForm
            speaker={speakerData}
            setSpeaker={handleSpeakerDataChange}
            emails={emails}
            mode="profile"
            showEmailField={false}
            showImageUpload={true}
            showLinks={true}
            onImageUpload={uploadImage}
            className="space-y-6"
          />

          <div className="flex justify-end border-t border-gray-200 pt-6 dark:border-gray-600">
            <button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="font-space-grotesk inline-flex items-center rounded-lg bg-brand-cloud-blue px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue/90 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus:outline-blue-500"
            >
              {updateProfileMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" color="white" className="mr-2" />
                  Updating...
                </>
              ) : (
                'Update Profile'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
