'use client'

import { useState, useEffect, useCallback } from 'react'
import { Speaker, SpeakerInput } from '@/lib/speaker/types'
import { api } from '@/lib/trpc/client'
import { SpeakerDetailsForm } from './SpeakerDetailsForm'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import { useSpeakerImageUpload } from '@/hooks/useSpeakerImageUpload'
import { LinkedProviders } from './LinkedProviders'
import { PushNotificationSettings } from '@/components/pwa'
import { startProviderLink } from '@/app/(cfp)/cfp/profile/link-actions'

const PROVIDER_LABELS: Record<string, string> = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
}

/** Human-readable list of the providers currently managing this profile. */
function describeProviders(providers?: string[]): string {
  const names = Array.from(
    new Set(
      (providers ?? [])
        .map((entry) => PROVIDER_LABELS[entry.split(':')[0]])
        .filter((name): name is string => Boolean(name)),
    ),
  )
  if (names.length === 0) return 'Managed by your sign-in provider'
  if (names.length === 1) return `Managed by ${names[0]}`
  return `Managed by ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

interface CFPProfilePageProps {
  initialSpeaker: Speaker
  conferenceId?: string
  /** Provider the user is currently signed in with (`session.account.provider`). */
  currentProvider?: string
  /** Outcome of a just-completed provider link, from `?linkResult=`. */
  linkResult?: string
}

export function CFPProfilePage({
  initialSpeaker,
  currentProvider,
  linkResult,
}: CFPProfilePageProps) {
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

  const handleProfileSubmit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault()
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
        {/* Not a <form>: LinkedProviders renders its own <form action> per
            provider, and nesting forms is invalid HTML that breaks both the
            profile save and the link buttons. Submit via the button below. */}
        <div className="space-y-8">
          {linkResult === 'linked' && (
            <div
              role="status"
              className="rounded-lg bg-brand-fresh-green/10 p-4 ring-1 ring-brand-fresh-green/20 dark:bg-green-900/20 dark:ring-green-500/30"
            >
              <div className="flex items-center gap-2">
                <CheckCircleIcon
                  className="h-5 w-5 text-brand-fresh-green dark:text-green-400"
                  aria-hidden="true"
                />
                <p className="font-inter text-sm font-medium text-brand-fresh-green dark:text-green-400">
                  Sign-in method linked. You can now use it to reach this
                  profile.
                </p>
              </div>
            </div>
          )}

          {linkResult === 'already-linked' && (
            <div
              role="alert"
              className="rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:ring-amber-500/30"
            >
              <div className="flex">
                <div className="shrink-0">
                  <ExclamationCircleIcon
                    className="h-5 w-5 text-amber-500 dark:text-amber-400"
                    aria-hidden="true"
                  />
                </div>
                <div className="ml-3">
                  <p className="font-inter text-sm text-amber-800 dark:text-amber-200">
                    That account is already linked to a different speaker
                    profile. To combine the two profiles, please contact the
                    organizers &mdash; we did not change either profile.
                  </p>
                </div>
              </div>
            </div>
          )}

          {linkResult === 'error' && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-900/20 dark:ring-red-500/30"
            >
              <p className="font-inter text-sm text-red-800 dark:text-red-200">
                We couldn&apos;t link that sign-in method. Please try again.
              </p>
            </div>
          )}

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
                {describeProviders(speaker.providers)}
              </span>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6 dark:border-gray-600">
            <LinkedProviders
              providers={speaker.providers}
              currentProvider={currentProvider}
              onLinkAction={startProviderLink}
            />
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

          <section
            aria-labelledby="messaging-emails-heading"
            className="border-t border-gray-200 pt-6 dark:border-gray-600"
          >
            <h2
              id="messaging-emails-heading"
              className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white"
            >
              Message emails
            </h2>
            <div className="mt-3 flex items-start justify-between gap-4">
              <label
                htmlFor="messaging-email-default"
                className="font-inter flex-1 text-sm text-gray-600 dark:text-gray-400"
              >
                Message emails are on by default: we email you when an organizer
                writes in one of your conversations. Turn this off to rely on
                in-app notifications only — you can still override it per
                conversation.
              </label>
              {/* ABSENT-MEANS-ENABLED (M4): only an explicit false is off. */}
              <button
                type="button"
                role="switch"
                id="messaging-email-default"
                aria-checked={speakerData.messagingEmailDefault !== false}
                aria-label="Email me about new messages"
                onClick={() =>
                  setSpeakerData((prev) => ({
                    ...prev,
                    messagingEmailDefault: prev.messagingEmailDefault === false,
                  }))
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue ${
                  speakerData.messagingEmailDefault !== false
                    ? 'bg-brand-cloud-blue dark:bg-blue-600'
                    : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow-sm transition-transform ${
                    speakerData.messagingEmailDefault !== false
                      ? 'translate-x-5'
                      : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </section>

          <PushNotificationSettings />

          <div className="flex justify-end border-t border-gray-200 pt-6 dark:border-gray-600">
            <button
              type="button"
              onClick={handleProfileSubmit}
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
        </div>
      </div>
    </div>
  )
}
