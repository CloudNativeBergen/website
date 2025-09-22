import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getInvitationByToken } from '@/lib/cospeaker/sanity'
import InvitationResponseClient from '@/components/InvitationResponseClient'
import { AppEnvironment } from '@/lib/environment'
import { DevBanner } from '@/components/DevBanner'

export const metadata: Metadata = {
  title: 'Co-Speaker Invitation | Cloud Native Bergen',
  description: 'Respond to your co-speaker invitation',
}

interface PageProps {
  searchParams: Promise<{
    token?: string
    test?: string
  }>
}

export default async function InvitationResponsePage({
  searchParams,
}: PageProps) {
  const session = await auth()
  const params = await searchParams

  const isTestMode = AppEnvironment.isDevelopment && params.test === 'true'

  if (!session?.user?.email && !isTestMode) {
    const callbackUrl = `/invitation/respond?token=${params.token || ''}`
    console.log('Redirecting to sign-in with callback URL:', callbackUrl)
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  }

  const token = params.token
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-6">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h2 className="mb-2 text-lg font-semibold text-red-800">
              Invalid Invitation Link
            </h2>
            <p className="text-red-600">
              This invitation link is invalid. Please check the link in your
              email and try again.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const invitation = await getInvitationByToken(token)

  if (!invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-6">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h2 className="mb-2 text-lg font-semibold text-red-800">
              Invalid or Expired Invitation
            </h2>
            <p className="text-red-600">
              This invitation link is either invalid or has expired. Co-speaker
              invitations are valid for 14 days.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (invitation.status !== 'pending') {
    const statusMessage =
      invitation.status === 'accepted'
        ? 'You have already accepted this invitation.'
        : invitation.status === 'declined'
          ? 'You have already declined this invitation.'
          : 'This invitation has expired.'

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-6">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h2 className="mb-2 text-lg font-semibold text-blue-800">
              Invitation Already Processed
            </h2>
            <p className="text-blue-600">{statusMessage}</p>
            <Link
              href="/speaker/proposals"
              className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Go to Speaker Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const clientInvitation = {
    _id: invitation._id,
    status: invitation.status as 'pending' | 'accepted' | 'declined',
    invitedBy:
      typeof invitation.invitedBy === 'object' && 'name' in invitation.invitedBy
        ? { name: invitation.invitedBy.name }
        : { name: 'Unknown' },
    invitedName: invitation.invitedName || '',
    invitedEmail: invitation.invitedEmail,
    proposal:
      typeof invitation.proposal === 'object' && '_id' in invitation.proposal
        ? {
            _id: invitation.proposal._id,
            title: invitation.proposal.title || 'Unknown Proposal',
            format: 'talk' as const,
          }
        : {
            _id: 'unknown',
            title: 'Unknown Proposal',
            format: 'talk' as const,
          },
    expiresAt: invitation.expiresAt,
  }

  return (
    <>
      <DevBanner />
      <InvitationResponseClient
        invitation={clientInvitation}
        token={token}
        userName={
          isTestMode ? AppEnvironment.testUser.name : session?.user?.name || ''
        }
        isTestMode={isTestMode}
      />
    </>
  )
}
