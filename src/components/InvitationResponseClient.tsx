'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { formatDistanceToNow } from 'date-fns'
import { api } from '@/lib/trpc/client'
import { formatProposalFormat } from '@/lib/cospeaker/types'

interface InvitationResponseClientProps {
  invitation: {
    _id: string
    status: 'pending' | 'accepted' | 'declined'
    invitedBy: {
      name: string
    }
    invitedName: string
    invitedEmail: string
    proposal: {
      _id: string
      title: string
      format: string
    }
    expiresAt: string
  }
  token: string
  userName: string
  isTestMode?: boolean
}

export default function InvitationResponseClient({
  invitation,
  token,
  userName,
  isTestMode = false,
}: InvitationResponseClientProps) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [isExpired, setIsExpired] = useState(false)

  const respondMutation = api.proposal.invitation.respond.useMutation({
    onSuccess: (data, variables) => {
      const successUrl = new URL(
        '/invitation/respond/success',
        window.location.origin,
      )
      successUrl.searchParams.set(
        'action',
        variables.accept ? 'accepted' : 'declined',
      )
      successUrl.searchParams.set('title', invitation.proposal.title)
      if (isTestMode) {
        successUrl.searchParams.set('test', 'true')
      }
      router.push(successUrl.toString())
    },
    onError: (error) => {
      setError(
        error.message || 'Failed to process your response. Please try again.',
      )
    },
  })

  useEffect(() => {
    const checkExpiry = () => {
      const now = new Date()
      const expiryDate = new Date(invitation.expiresAt)
      setIsExpired(now >= expiryDate)
    }

    checkExpiry()

    const interval = setInterval(checkExpiry, 60000)

    return () => clearInterval(interval)
  }, [invitation.expiresAt])

  const handleResponse = async (action: 'accept' | 'decline') => {
    if (isExpired) {
      setError(
        'This invitation has expired and can no longer be accepted or declined.',
      )
      return
    }

    setError('')
    respondMutation.mutate({ token, accept: action === 'accept' })
  }

  const expiresIn = formatDistanceToNow(new Date(invitation.expiresAt), {
    addSuffix: true,
  })
  const displayName = userName || invitation.invitedName || 'there'

  return (
    <div className="bg-sky-mist flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="overflow-hidden rounded-lg bg-white shadow-lg">
          <div className="from-cloud-blue to-cloud-blue-dark bg-gradient-to-r px-6 py-8 text-white">
            <h1 className="mb-2 text-2xl font-bold">Co-Speaker Invitation</h1>
            <p className="text-sky-mist">
              You&apos;ve been invited to collaborate on a proposal
            </p>
          </div>

          <div className="space-y-6 p-6">
            <div>
              <p className="text-lg text-gray-700">Hi {displayName},</p>
              <p className="mt-2 text-gray-600">
                <strong>{invitation.invitedBy?.name || 'A speaker'}</strong> has
                invited you to be a co-speaker for their proposal.
              </p>
            </div>

            <div className="bg-sky-mist/20 space-y-3 rounded-lg p-4">
              <div>
                <h3 className="text-cloud-blue-dark text-sm font-medium">
                  Proposal Title
                </h3>
                <p className="text-cloud-blue mt-1 text-lg font-semibold">
                  {invitation.proposal.title}
                </p>
              </div>
              <div>
                <h3 className="text-cloud-blue-dark text-sm font-medium">
                  Format
                </h3>
                <p className="text-cloud-blue mt-1">
                  {formatProposalFormat(invitation.proposal.format)}
                </p>
              </div>
            </div>

            {isExpired ? (
              <div className="flex items-start space-x-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 text-red-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800">
                    This invitation has expired
                  </p>
                  <p className="mt-1 text-sm text-red-700">
                    This invitation expired {expiresIn} and can no longer be
                    accepted or declined.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start space-x-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <ClockIcon className="mt-0.5 h-5 w-5 text-amber-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800">
                    This invitation expires {expiresIn}
                  </p>
                  <p className="mt-1 text-sm text-amber-700">
                    Please respond before the invitation expires.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {!isExpired && (
              <div className="flex flex-col gap-4 sm:flex-row">
                <button
                  onClick={() => handleResponse('accept')}
                  disabled={respondMutation.isPending}
                  className="flex flex-1 items-center justify-center space-x-2 rounded-lg bg-brand-nordic-purple px-6 py-3 text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {respondMutation.isPending ? (
                    <svg
                      className="h-5 w-5 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  ) : (
                    <CheckCircleIcon className="h-5 w-5" />
                  )}
                  <span className="font-medium">Accept Invitation</span>
                </button>

                <button
                  onClick={() => handleResponse('decline')}
                  disabled={respondMutation.isPending}
                  className="flex flex-1 items-center justify-center space-x-2 rounded-lg bg-brand-slate-gray px-6 py-3 text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {respondMutation.isPending ? (
                    <svg
                      className="h-5 w-5 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  ) : (
                    <XCircleIcon className="h-5 w-5" />
                  )}
                  <span className="font-medium">Decline Invitation</span>
                </button>
              </div>
            )}

            {isExpired && (
              <div className="text-center">
                <p className="mb-4 text-gray-600">
                  This invitation is no longer valid. Please contact{' '}
                  {invitation.invitedBy?.name || 'the inviting speaker'} if
                  you&apos;d still like to collaborate on this proposal.
                </p>
                <button
                  onClick={() => router.push('/')}
                  className="bg-cloud-blue hover:bg-cloud-blue-dark inline-flex items-center space-x-2 rounded-lg px-6 py-3 text-white transition-colors"
                >
                  <span>Return to Home</span>
                </button>
              </div>
            )}

            {!isExpired && (
              <div className="space-y-2 text-sm text-gray-500">
                <p>By accepting this invitation:</p>
                <ul className="ml-2 list-inside list-disc space-y-1">
                  <li>
                    You&apos;ll be listed as a co-speaker on this proposal
                  </li>
                  <li>You&apos;ll receive updates about the proposal status</li>
                  <li>
                    You&apos;ll be able to view the proposal in your speaker
                    dashboard
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
