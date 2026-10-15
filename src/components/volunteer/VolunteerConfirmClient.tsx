'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/trpc/client'
import { formatDateTimeSafe } from '@/lib/time'
import {
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  TicketIcon,
  ChatBubbleLeftRightIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'

export type VolunteerConfirmState =
  'ready' | 'confirmed' | 'invalid' | 'not-approved'

export interface VolunteerConfirmClientProps {
  initialState: VolunteerConfirmState
  token?: string
  volunteerName?: string
  conferenceTitle?: string
  confirmedAt?: string
  registrationUrl?: string | null
  slackInviteUrl?: string | null
  contactEmail?: string
}

function isSafeHttpsUrl(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function VolunteerConfirmClient({
  initialState,
  token,
  volunteerName,
  conferenceTitle,
  confirmedAt: initialConfirmedAt,
  registrationUrl: initialRegistrationUrl,
  slackInviteUrl: initialSlackInviteUrl,
  contactEmail,
}: VolunteerConfirmClientProps) {
  const [state, setState] = useState<VolunteerConfirmState>(initialState)
  const [confirmedAt, setConfirmedAt] = useState<string | undefined>(
    initialConfirmedAt,
  )
  const [registrationUrl, setRegistrationUrl] = useState<
    string | null | undefined
  >(initialRegistrationUrl)
  const [slackInviteUrl, setSlackInviteUrl] = useState<
    string | null | undefined
  >(initialSlackInviteUrl)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const confirmMutation = api.volunteer.confirmAttendance.useMutation({
    onSuccess: (data) => {
      setState('confirmed')
      setConfirmedAt(data.confirmedAt)
      setRegistrationUrl(data.registrationUrl)
      setSlackInviteUrl(data.slackInviteUrl)
      setErrorMessage(null)
    },
    onError: (err) => {
      setErrorMessage(
        err.message ||
          'Could not confirm your attendance. Please try again or contact the organizers.',
      )
    },
  })

  const handleConfirm = () => {
    if (!token) return
    setErrorMessage(null)
    confirmMutation.mutate({ token })
  }

  const safeRegistrationUrl = isSafeHttpsUrl(registrationUrl)
    ? registrationUrl
    : null
  const safeSlackInviteUrl = isSafeHttpsUrl(slackInviteUrl)
    ? slackInviteUrl
    : null

  if (state === 'invalid' || state === 'not-approved') {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white/90 p-6 shadow-sm backdrop-blur-sm sm:p-8 dark:border-amber-800/60 dark:bg-gray-800/90">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
            <ExclamationTriangleIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-space-grotesk text-xl font-bold text-gray-900 dark:text-white">
              {state === 'not-approved'
                ? 'Application Not Eligible for Confirmation'
                : 'Invalid Confirmation Link'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {state === 'not-approved'
                ? 'Only approved volunteer applications can confirm attendance. If you believe this is a mistake, please reach out to the organizers.'
                : 'This volunteer confirmation link is invalid or incomplete. Please check the link in your approval email and try again.'}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/volunteer"
                className="inline-flex items-center justify-center rounded-lg bg-brand-cloud-blue px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-blue-700"
              >
                Back to Volunteer Page
              </Link>
              {contactEmail && (
                <a
                  href={`mailto:${contactEmail}`}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  Contact Organizers
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'confirmed') {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-emerald-200 bg-white/90 p-6 shadow-sm backdrop-blur-sm sm:p-8 dark:border-emerald-800/60 dark:bg-gray-800/90">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
            <CheckBadgeIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                Attendance Confirmed
              </span>
              {confirmedAt && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDateTimeSafe(confirmedAt)}
                </span>
              )}
            </div>
            <h2 className="font-space-grotesk mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              Thank you{volunteerName ? `, ${volunteerName}` : ''}!
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              Your volunteer attendance for{' '}
              <span className="font-semibold text-gray-900 dark:text-white">
                {conferenceTitle || 'the conference'}
              </span>{' '}
              is confirmed. Complete your onboarding below to claim your free
              volunteer pass and join the crew channel.
            </p>
          </div>
        </div>

        {(safeRegistrationUrl || safeSlackInviteUrl) && (
          <div className="mt-6 space-y-3 border-t border-gray-200 pt-6 dark:border-gray-700">
            <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
              Next Steps
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {safeRegistrationUrl && (
                <a
                  href={safeRegistrationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-cloud-blue px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-blue-700"
                >
                  <TicketIcon className="h-5 w-5 shrink-0" />
                  <span>Claim Volunteer Ticket</span>
                  <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0 opacity-80" />
                </a>
              )}
              {safeSlackInviteUrl && (
                <a
                  href={safeSlackInviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-xs transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                >
                  <ChatBubbleLeftRightIcon className="h-5 w-5 shrink-0 text-brand-cloud-blue dark:text-blue-400" />
                  <span>Join Volunteer Slack</span>
                  <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0 opacity-70" />
                </a>
              )}
            </div>
          </div>
        )}

        {!safeRegistrationUrl && !safeSlackInviteUrl && (
          <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-700/50 dark:text-gray-300">
            The organizing team has been notified of your confirmation and will
            follow up with your ticket and shift details shortly.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-sm backdrop-blur-sm sm:p-8 dark:border-gray-700 dark:bg-gray-800/90">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-brand-cloud-blue dark:bg-blue-900/40 dark:text-blue-400">
          <CheckBadgeIcon className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
            Action Required
          </span>
          <h2 className="font-space-grotesk mt-2 text-2xl font-bold text-gray-900 dark:text-white">
            Confirm Your Volunteer Attendance
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            Hi{' '}
            <span className="font-semibold text-gray-900 dark:text-white">
              {volunteerName || 'there'}
            </span>
            ! You have been approved to volunteer at{' '}
            <span className="font-semibold text-gray-900 dark:text-white">
              {conferenceTitle || 'the conference'}
            </span>
            . Please confirm that you will be joining our volunteer crew to
            unlock your volunteer ticket and onboarding links.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirmMutation.isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-cloud-blue px-6 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          <CheckBadgeIcon className="h-5 w-5" />
          <span>
            {confirmMutation.isPending
              ? 'Confirming Attendance...'
              : 'Confirm My Attendance'}
          </span>
        </button>
        {contactEmail && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Can&apos;t make it?{' '}
            <a
              href={`mailto:${contactEmail}`}
              className="font-medium text-brand-cloud-blue underline hover:text-blue-700 dark:text-blue-400"
            >
              Let the organizers know
            </a>
          </p>
        )}
      </div>
    </div>
  )
}
