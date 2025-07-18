'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/outline'
import { signIn, useSession } from 'next-auth/react'
import Link from 'next/link'

interface InvitationDetails {
  proposalId: string
  proposalTitle: string
  primarySpeaker: {
    name: string
    email: string
  }
  invitedEmail: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  expiresAt: string
}

export default function CoSpeakerInvitePage() {
  const params = useParams()
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const token = params.token as string

  useEffect(() => {
    if (token) {
      fetchInvitation()
    }
  }, [token])

  const fetchInvitation = async () => {
    try {
      const response = await fetch(`/api/proposal/invite/${token}`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch invitation')
      }
      const data = await response.json()
      setInvitation(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invitation')
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (action: 'accept' | 'reject') => {
    if (!invitation || processing) return

    // Check if user is signed in
    if (sessionStatus !== 'authenticated') {
      // Store the intended action in session storage
      sessionStorage.setItem('coSpeakerAction', JSON.stringify({
        token,
        action,
        redirectTo: `/cfp/invite/${token}`
      }))
      // Redirect to sign in
      await signIn('email', {
        email: invitation.invitedEmail,
        callbackUrl: `/cfp/invite/${token}`
      })
      return
    }

    // Verify the signed-in user matches the invited email
    if (session.user?.email?.toLowerCase() !== invitation.invitedEmail.toLowerCase()) {
      setError('You must sign in with the invited email address to respond to this invitation')
      return
    }

    setProcessing(true)
    try {
      const response = await fetch(`/api/proposal/invite/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to process invitation')
      }

      const result = await response.json()
      
      if (action === 'accept') {
        // Redirect to speaker dashboard
        router.push('/speaker/dashboard?welcome=co-speaker')
      } else {
        // Show rejection confirmation
        setInvitation({
          ...invitation,
          status: 'rejected'
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process invitation')
    } finally {
      setProcessing(false)
    }
  }

  // Handle stored action after sign in
  useEffect(() => {
    if (sessionStatus === 'authenticated' && invitation) {
      const storedAction = sessionStorage.getItem('coSpeakerAction')
      if (storedAction) {
        try {
          const { token: storedToken, action } = JSON.parse(storedAction)
          if (storedToken === token) {
            sessionStorage.removeItem('coSpeakerAction')
            handleAction(action)
          }
        } catch (err) {
          console.error('Failed to parse stored action:', err)
        }
      }
    }
  }, [sessionStatus, invitation])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading invitation...</p>
        </div>
      </div>
    )
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <XCircleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invitation</h1>
          <p className="text-gray-600 mb-6">{error || 'This invitation link is invalid or has expired.'}</p>
          <Link
            href="/"
            className="text-brand-cloud-blue hover:text-brand-cloud-blue-dark font-medium"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    )
  }

  // Check if invitation is expired
  const isExpired = invitation.status === 'expired' || new Date(invitation.expiresAt) < new Date()

  if (isExpired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invitation Expired</h1>
          <p className="text-gray-600 mb-6">
            This invitation has expired. Please contact {invitation.primarySpeaker.name} to request a new invitation.
          </p>
          <Link
            href="/"
            className="text-brand-cloud-blue hover:text-brand-cloud-blue-dark font-medium"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    )
  }

  if (invitation.status === 'accepted') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Already Accepted</h1>
          <p className="text-gray-600 mb-6">
            You have already accepted this co-speaker invitation.
          </p>
          <Link
            href="/speaker/dashboard"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-cloud-blue hover:bg-brand-cloud-blue-dark"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (invitation.status === 'rejected') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <XCircleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invitation Declined</h1>
          <p className="text-gray-600 mb-6">
            You have declined this co-speaker invitation.
          </p>
          <Link
            href="/"
            className="text-brand-cloud-blue hover:text-brand-cloud-blue-dark font-medium"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Co-Speaker Invitation</h1>
          <p className="text-gray-600">
            You've been invited to be a co-speaker
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Proposal Details</h2>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Title:</span> {invitation.proposalTitle}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Primary Speaker:</span> {invitation.primarySpeaker.name}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Your Email:</span> {invitation.invitedEmail}
              </p>
            </div>
          </div>

          {sessionStatus !== 'authenticated' ? (
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-4">
                Please sign in with your invited email address to respond to this invitation.
              </p>
              <button
                onClick={() => handleAction('accept')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-cloud-blue hover:bg-brand-cloud-blue-dark"
              >
                Sign In to Continue
              </button>
            </div>
          ) : session.user?.email?.toLowerCase() !== invitation.invitedEmail.toLowerCase() ? (
            <div className="text-center">
              <p className="text-sm text-red-600 mb-4">
                You are signed in as {session.user.email}, but this invitation is for {invitation.invitedEmail}.
                Please sign in with the correct email address.
              </p>
              <button
                onClick={() => signIn('email', { email: invitation.invitedEmail })}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-cloud-blue hover:bg-brand-cloud-blue-dark"
              >
                Sign In with Correct Email
              </button>
            </div>
          ) : (
            <div className="flex space-x-4">
              <button
                onClick={() => handleAction('accept')}
                disabled={processing}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Processing...' : 'Accept Invitation'}
              </button>
              <button
                onClick={() => handleAction('reject')}
                disabled={processing}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Processing...' : 'Decline'}
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            This invitation expires on {new Date(invitation.expiresAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  )
}