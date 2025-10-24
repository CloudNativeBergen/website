'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { PortableText } from '@portabletext/react'
import { Button } from '@/components/Button'
import type {
  ProposalWithWorkshopData,
  WorkshopSignupExisting,
  ExperienceLevel,
  OperatingSystem,
} from '@/lib/workshop/types'
import {
  getWorkshopDuration,
  formatTime,
  getWorkshopDateTime,
} from '@/lib/workshop/utils'
import {
  hasConfirmedSignup,
  isUserOnWaitlist,
  shouldShowAsFull,
  getSignupButtonText,
} from '@/lib/workshop/status'
import { getCapacityStatusMessage } from '@/lib/workshop/capacity'
import {
  ClockIcon,
  UserGroupIcon,
  AcademicCapIcon,
  UserIcon,
  MapPinIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid'

interface WorkshopCardProps {
  workshop: ProposalWithWorkshopData
  userSignups: WorkshopSignupExisting[]
  onSignup: (
    workshopId: string,
    experienceLevel: ExperienceLevel,
    operatingSystem: OperatingSystem,
  ) => Promise<{ success: boolean; error?: string }>
  onCancel?: () => Promise<{ success: boolean; error?: string }>
  isSignedUp?: boolean
  isFull?: boolean
  isLoading?: boolean
  hasTimeConflict?: boolean
  conflictingWorkshopTitle?: string
}

export default function WorkshopCard({
  workshop,
  userSignups,
  onSignup,
  onCancel,
  isSignedUp = false,
  isFull = false,
  isLoading: externalLoading = false,
  hasTimeConflict = false,
  conflictingWorkshopTitle,
}: WorkshopCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSignupModal, setShowSignupModal] = useState(false)
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    'intermediate' as ExperienceLevel,
  )
  const [operatingSystem, setOperatingSystem] =
    useState<OperatingSystem>('macos')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  const actuallySignedUp =
    isSignedUp || hasConfirmedSignup(workshop._id, userSignups)
  const isOnWaitlist = isUserOnWaitlist(workshop._id, userSignups)

  const duration = getWorkshopDuration(workshop.format)
  const actuallyFull = isFull || shouldShowAsFull(workshop)

  const {
    startTime,
    endTime,
    room: workshopRoom,
  } = getWorkshopDateTime(workshop)

  const handleSignupClick = () => {
    setShowSignupModal(true)
  }

  const handleSignupSubmit = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await onSignup(
        workshop._id,
        experienceLevel,
        operatingSystem,
      )
      if (!result.success) {
        setError(result.error || 'Failed to sign up')
      } else {
        setShowSignupModal(false)
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!onCancel) return

    setIsLoading(true)
    setError(null)

    try {
      const result = await onCancel()
      if (!result.success) {
        setError(result.error || 'Failed to cancel signup')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const modalContent = showSignupModal && (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={() => setShowSignupModal(false)}
    >
      <div
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setShowSignupModal(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Close"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>

        <h3 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
          Complete Your Registration
        </h3>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              What is your experience level?
            </label>
            <div className="space-y-2">
              {[
                {
                  value: 'beginner' as const,
                  label: 'Beginner',
                  desc: 'New to this topic',
                },
                {
                  value: 'intermediate' as const,
                  label: 'Intermediate',
                  desc: 'Some experience',
                },
                {
                  value: 'advanced' as const,
                  label: 'Advanced',
                  desc: 'Experienced practitioner',
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start rounded-lg border-2 p-3 transition-all ${
                    experienceLevel === option.value
                      ? 'border-brand-cloud-blue bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="experienceLevel"
                    value={option.value}
                    checked={experienceLevel === option.value}
                    onChange={(e) =>
                      setExperienceLevel(e.target.value as ExperienceLevel)
                    }
                    className="mt-0.5 h-4 w-4 text-brand-cloud-blue focus:ring-brand-cloud-blue"
                  />
                  <div className="ml-3">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {option.label}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {option.desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              What operating system will you be using?
            </label>
            <div className="space-y-2">
              {[
                { value: 'windows' as const, label: 'Windows' },
                { value: 'macos' as const, label: 'macOS' },
                { value: 'linux' as const, label: 'Linux' },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center rounded-lg border-2 p-3 transition-all ${
                    operatingSystem === option.value
                      ? 'border-brand-cloud-blue bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="operatingSystem"
                    value={option.value}
                    checked={operatingSystem === option.value}
                    onChange={(e) =>
                      setOperatingSystem(e.target.value as OperatingSystem)
                    }
                    className="h-4 w-4 text-brand-cloud-blue focus:ring-brand-cloud-blue"
                  />
                  <div className="ml-3 font-medium text-gray-900 dark:text-white">
                    {option.label}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleSignupSubmit}
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Registering...' : 'Confirm Registration'}
            </Button>
            <Button
              onClick={() => setShowSignupModal(false)}
              disabled={isLoading}
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {mounted &&
        showSignupModal &&
        typeof window !== 'undefined' &&
        createPortal(modalContent, document.body)}

      <div className="rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-md dark:bg-gray-800 dark:hover:shadow-lg">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="font-space-grotesk mb-2 text-xl font-semibold text-brand-slate-gray dark:text-white">
              {workshop.title}
            </h3>

            {workshop.speakers && workshop.speakers.length > 0 && (
              <div className="mb-3">
                {workshop.speakers.length === 1 ? (
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/speaker/${workshop.speakers[0].slug || workshop.speakers[0]._id}`}
                      className="flex-shrink-0"
                    >
                      {workshop.speakers[0]?.image ? (
                        <img
                          src={workshop.speakers[0].image}
                          alt={workshop.speakers[0].name}
                          className="h-10 w-10 rounded-full object-cover transition-all hover:ring-2 hover:ring-brand-cloud-blue"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 transition-all hover:ring-2 hover:ring-brand-cloud-blue dark:bg-blue-900/30">
                          <UserIcon className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                        </div>
                      )}
                    </Link>
                    <div>
                      <Link
                        href={`/speaker/${workshop.speakers[0].slug || workshop.speakers[0]._id}`}
                        className="text-sm font-medium text-brand-cloud-blue hover:underline dark:text-blue-400"
                      >
                        {workshop.speakers[0].name}
                      </Link>
                      {workshop.speakers[0].company && (
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {workshop.speakers[0].company}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {workshop.speakers.slice(0, 3).map((speaker, index) => (
                          <Link
                            key={speaker._id || index}
                            href={`/speaker/${speaker.slug || speaker._id}`}
                            className="relative hover:z-10"
                          >
                            {speaker.image ? (
                              <img
                                src={speaker.image}
                                alt={speaker.name}
                                className="h-8 w-8 rounded-full object-cover ring-2 ring-white transition-all hover:ring-brand-cloud-blue dark:ring-gray-800"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 ring-2 ring-white transition-all hover:ring-brand-cloud-blue dark:bg-blue-900/30 dark:ring-gray-800">
                                <UserIcon className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                              </div>
                            )}
                          </Link>
                        ))}
                        {workshop.speakers.length > 3 && (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600 ring-2 ring-white dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-800">
                            +{workshop.speakers.length - 3}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-brand-cloud-blue dark:text-blue-400">
                          {workshop.speakers.map((s, idx) => (
                            <span key={s._id || idx}>
                              <Link
                                href={`/speaker/${s.slug || s._id}`}
                                className="hover:underline"
                              >
                                {s.name}
                              </Link>
                              {idx < workshop.speakers.length - 1 && ', '}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {workshop.speakers.length} speakers
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mb-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
              <div className="flex flex-col gap-2">
                {workshopRoom ? (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPinIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {workshopRoom}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPinIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <span className="text-gray-500 italic dark:text-gray-400">
                      Room to be announced
                    </span>
                  </div>
                )}
                {startTime && endTime ? (
                  <div className="flex items-center gap-2 text-sm">
                    <ClockIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatTime(startTime)} - {formatTime(endTime)}
                    </span>
                  </div>
                ) : startTime ? (
                  <div className="flex items-center gap-2 text-sm">
                    <ClockIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      Starts at {formatTime(startTime)}
                    </span>
                  </div>
                ) : endTime ? (
                  <div className="flex items-center gap-2 text-sm">
                    <ClockIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      Ends at {formatTime(endTime)}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    <ClockIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <span className="text-gray-500 italic dark:text-gray-400">
                      Time to be announced
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <span className="inline-flex items-center rounded-full bg-brand-cloud-blue/10 px-3 py-1 text-sm font-medium text-brand-cloud-blue dark:bg-blue-900/30 dark:text-blue-400">
                <AcademicCapIcon className="mr-1.5 h-4 w-4" />
                {duration}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                  actuallyFull
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : workshop.available < 5
                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                }`}
              >
                <UserGroupIcon className="mr-1.5 h-4 w-4" />
                {getCapacityStatusMessage(workshop.capacity, workshop.signups)}
              </span>
              {((workshop.waitlistCount !== undefined &&
                workshop.waitlistCount > 0) ||
                workshop.available < 0) && (
                <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  <ClockIcon className="mr-1.5 h-4 w-4" />
                  {workshop.waitlistCount || Math.abs(workshop.available)} on
                  waitlist
                </span>
              )}
              {workshop.format && workshop.format.includes('workshop') && (
                <span className="inline-flex items-center rounded-full bg-accent-purple/10 px-3 py-1 text-sm font-medium text-accent-purple dark:bg-purple-900/30 dark:text-purple-400">
                  <AcademicCapIcon className="mr-1.5 h-4 w-4" />
                  {workshop.format === 'workshop_120'
                    ? 'Hands-on Workshop'
                    : 'Extended Workshop'}
                </span>
              )}
            </div>
          </div>

          {actuallySignedUp && (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircleIconSolid
                className="h-6 w-6 text-green-600 dark:text-green-400"
                aria-label="Signed up"
              />
            </div>
          )}
        </div>

        {workshop.description && (
          <div className="mb-4">
            <div className="prose prose-sm dark:prose-invert prose-p:my-3 max-w-none text-gray-600 dark:text-gray-300">
              {typeof workshop.description === 'string' ? (
                <p>{workshop.description}</p>
              ) : Array.isArray(workshop.description) &&
                workshop.description.length > 0 ? (
                <PortableText value={workshop.description} />
              ) : (
                <p className="italic">No description provided</p>
              )}
            </div>
          </div>
        )}

        {workshop.topics && workshop.topics.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {workshop.topics.map((topic, index) => (
              <span
                key={topic._id || `topic-${index}`}
                className="rounded-md bg-brand-sky-mist px-2 py-1 text-xs font-medium text-brand-slate-gray dark:bg-gray-700 dark:text-gray-300"
                style={
                  topic.color
                    ? {
                        backgroundColor: `${topic.color}20`,
                        color: topic.color,
                      }
                    : undefined
                }
              >
                {topic.title}
              </span>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        {hasTimeConflict && !actuallySignedUp && (
          <div className="mb-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
            <div className="flex items-start gap-2">
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Time Conflict</p>
                <p className="mt-1 text-xs">
                  This workshop conflicts with &quot;{conflictingWorkshopTitle}
                  &quot; that you&apos;re already registered for
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          {actuallySignedUp ? (
            <div className="space-y-3">
              <div
                className={`flex items-center justify-center gap-2 text-sm font-medium ${
                  isOnWaitlist
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-green-600 dark:text-green-400'
                }`}
              >
                {isOnWaitlist ? (
                  <>
                    <ClockIcon className="h-5 w-5" />
                    You&apos;re on the waitlist for this workshop
                  </>
                ) : (
                  <>
                    <CheckCircleIconSolid className="h-5 w-5" />
                    You&apos;re registered for this workshop
                  </>
                )}
              </div>
              {onCancel && (
                <Button
                  onClick={handleCancel}
                  disabled={isLoading || externalLoading}
                  variant="outline"
                  className="w-full"
                >
                  {isLoading
                    ? 'Cancelling...'
                    : isOnWaitlist
                      ? 'Leave Waitlist'
                      : 'Cancel Registration'}
                </Button>
              )}
            </div>
          ) : hasTimeConflict ? (
            <Button
              disabled
              className="w-full"
              title={`Time conflict with ${conflictingWorkshopTitle}`}
            >
              Time Conflict - Cannot Register
            </Button>
          ) : (
            <Button
              onClick={handleSignupClick}
              disabled={isLoading || externalLoading}
              variant={actuallyFull ? 'outline' : 'primary'}
              className="w-full"
            >
              {getSignupButtonText(
                workshop,
                actuallySignedUp,
                isOnWaitlist,
                hasTimeConflict,
              )
                .replace('Sign Up', 'Register for Workshop')
                .replace('Workshop Full', 'Join Waitlist')}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
