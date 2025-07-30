import { useState, useEffect, useRef } from 'react'
import { Speaker } from '@/lib/speaker/types'
import { Format } from '@/lib/proposal/types'
import {
  XMarkIcon,
  EnvelopeIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { SpeakerAvatars } from './SpeakerAvatars'
import { CoSpeakerInvitation, InvitationStatus } from '@/lib/cospeaker/types'
import { cancelInvitation } from '@/lib/cospeaker/client'
import {
  getCoSpeakerLimit,
  allowsCoSpeakers,
  getSpeakerLimitDescription,
} from '@/lib/cospeaker/constants'

function getFormatDisplayName(format: Format): string {
  switch (format) {
    case Format.lightning_10:
      return 'Lightning Talk'
    case Format.presentation_20:
    case Format.presentation_25:
    case Format.presentation_40:
    case Format.presentation_45:
      return 'Presentation'
    case Format.workshop_120:
    case Format.workshop_240:
      return 'Workshop'
    default:
      return 'Talk'
  }
}

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface CoSpeakerSelectorProps {
  selectedSpeakers: Speaker[] // This should be just the co-speakers (not including current user)
  onSpeakersChange: (speakers: Speaker[]) => void
  format: Format
  proposalId?: string // Optional for new proposals
  pendingInvitations?: CoSpeakerInvitation[]
  onInvitationSent?: (invitation: CoSpeakerInvitation) => void
  onInvitationCanceled?: (invitationId: string) => void
}

interface InviteField {
  email: string
}

export function CoSpeakerSelector({
  selectedSpeakers,
  onSpeakersChange,
  format,
  proposalId,
  pendingInvitations = [],
  onInvitationSent,
  onInvitationCanceled,
}: CoSpeakerSelectorProps) {
  const maxCoSpeakers = getCoSpeakerLimit(format)

  // Initialize invite fields array based on max co-speakers
  const [inviteFields, setInviteFields] = useState<InviteField[]>(() =>
    Array(maxCoSpeakers)
      .fill(null)
      .map(() => ({ email: '' })),
  )
  const [isSendingInvite, setIsSendingInvite] = useState(false)
  const [inviteError, setInviteError] = useState<string>('')
  const [inviteSuccess, setInviteSuccess] = useState<string>('')
  const [cancelingInvitationId, setCancelingInvitationId] = useState<
    string | null
  >(null)

  const formatName = getFormatDisplayName(format)
  const isLightningTalk = !allowsCoSpeakers(format)

  // selectedSpeakers already contains only co-speakers (current user is excluded by ProposalForm)
  const coSpeakers = selectedSpeakers

  // Calculate total co-speakers including pending invitations
  const totalCoSpeakers =
    coSpeakers.length +
    pendingInvitations.filter((inv) => inv.status === 'pending').length

  // Update invite fields when format changes
  const prevMaxCoSpeakers = useRef(maxCoSpeakers)
  useEffect(() => {
    if (prevMaxCoSpeakers.current !== maxCoSpeakers) {
      setInviteFields(
        Array(maxCoSpeakers)
          .fill(null)
          .map((_, index) => inviteFields[index] || { email: '' }),
      )
      prevMaxCoSpeakers.current = maxCoSpeakers
    }
  }, [maxCoSpeakers, inviteFields])

  const handleFieldChange = (index: number, value: string) => {
    setInviteFields((prev) =>
      prev.map((item, i) => (i === index ? { email: value } : item)),
    )
  }

  // Clear a specific field
  const clearField = (index: number) => {
    setInviteFields((prev) =>
      prev.map((item, i) => (i === index ? { email: '' } : item)),
    )
  }

  const handleRemoveSpeaker = (speakerId: string) => {
    const newSpeakers = selectedSpeakers.filter((s) => s._id !== speakerId)
    onSpeakersChange(newSpeakers)
  }

  const handleCancelInvitation = async (invitationId: string) => {
    if (!proposalId) return

    setCancelingInvitationId(invitationId)
    setInviteError('')
    setInviteSuccess('')

    try {
      await cancelInvitation(proposalId, invitationId)
      setInviteSuccess('Invitation canceled successfully')

      // Notify parent component about the canceled invitation
      if (onInvitationCanceled) {
        onInvitationCanceled(invitationId)
      }
    } catch (error) {
      setInviteError(
        error instanceof Error ? error.message : 'Failed to cancel invitation',
      )
    } finally {
      setCancelingInvitationId(null)
    }
  }

  const handleSendInvitation = async () => {
    // Get filled fields (valid email addresses)
    const filledFields = inviteFields.filter(
      (field) => field.email.trim() && emailRegex.test(field.email),
    )

    if (filledFields.length === 0) {
      setInviteError('Please enter at least one valid email address')
      return
    }

    if (!proposalId) {
      setInviteError('Please save your proposal before inviting co-speakers')
      return
    }

    setIsSendingInvite(true)
    setInviteError('')
    setInviteSuccess('')

    try {
      const results = []

      // Send invitations for all filled fields
      for (const field of filledFields) {
        const response = await fetch(`/api/invitation/${proposalId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inviteeEmail: field.email,
            inviteeName: field.email
              .split('@')[0]
              .replace(/[._-]/g, ' ')
              .replace(/\b\w/g, (l) => l.toUpperCase()), // Convert email to a readable name
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(
            data.error || `Failed to send invitation to ${field.email}`,
          )
        }

        results.push({ field, invitation: data.invitation })
      }

      // Clear the sent fields and show success message
      const sentEmails = results.map((r) => r.field.email)
      setInviteSuccess(
        `Invitation${sentEmails.length > 1 ? 's' : ''} sent to ${sentEmails.join(', ')}`,
      )

      // Clear fields that were successfully sent
      setInviteFields((prev) =>
        prev.map((field) => {
          const wasSent = filledFields.some(
            (sent) => sent.email === field.email,
          )
          return wasSent ? { email: '' } : field
        }),
      )

      // Notify parent component about the new invitations
      if (onInvitationSent) {
        results.forEach((result) => {
          if (result.invitation) {
            onInvitationSent(result.invitation)
          }
        })
      }
    } catch (error) {
      setInviteError(
        error instanceof Error ? error.message : 'Failed to send invitation(s)',
      )
    } finally {
      setIsSendingInvite(false)
    }
  }

  const getInvitationStatusIcon = (status: InvitationStatus) => {
    switch (status) {
      case 'pending':
        return <ClockIcon className="text-cloud-blue h-5 w-5" />
      case 'accepted':
        return <CheckCircleIcon className="text-fresh-green h-5 w-5" />
      case 'declined':
        return <XCircleIcon className="text-cloud-blue-dark h-5 w-5" />
      case 'expired':
        return <ClockIcon className="text-sunbeam-yellow-dark h-5 w-5" />
      case 'canceled':
        return <XCircleIcon className="h-5 w-5 text-gray-400" />
      default:
        return null
    }
  }

  const getInvitationStatusText = (status: InvitationStatus) => {
    switch (status) {
      case 'pending':
        return 'Invitation pending'
      case 'accepted':
        return 'Invitation accepted'
      case 'declined':
        return 'Invitation declined'
      case 'expired':
        return 'Invitation expired'
      case 'canceled':
        return 'Invitation canceled'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="font-space-grotesk block text-sm leading-6 font-medium text-brand-slate-gray">
          Co-speakers
        </label>
        <p className="font-inter mt-1 text-sm leading-6 text-brand-cloud-gray">
          {isLightningTalk ? (
            <>
              Lightning talks are presented by a single speaker and cannot have
              co-speakers.
            </>
          ) : (
            <>
              {getSpeakerLimitDescription(format)}. Add co-speakers to your{' '}
              {formatName.toLowerCase()} by inviting them via email.
            </>
          )}
        </p>
      </div>

      {/* Warning for lightning talks */}
      {isLightningTalk && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-orange-400"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-orange-800" role="alert">
                Co-speakers not available for lightning talks
              </h3>
              <p className="mt-1 text-sm text-orange-700">
                Lightning talks are designed as single-speaker presentations. If
                you need to present with co-speakers, please select a different
                talk format (20-minute, 25-minute, 40-minute, or 45-minute
                presentation).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Show co-speakers section only if not a lightning talk */}
      {!isLightningTalk && (
        <>
          {/* Success message */}
          {inviteSuccess && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <CheckCircleIcon
                    className="text-fresh-green h-5 w-5"
                    aria-hidden="true"
                  />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-800">{inviteSuccess}</p>
                </div>
              </div>
            </div>
          )}

          {/* Pending invitations */}
          {pendingInvitations.length > 0 && (
            <div>
              <h4 className="text-cloud-blue-dark mb-2 text-sm font-medium">
                Pending Invitations
              </h4>
              <div className="space-y-2">
                {pendingInvitations.map((invitation) => (
                  <div
                    key={invitation._id}
                    className="flex items-center justify-between rounded-lg border bg-gray-50 p-3"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        {getInvitationStatusIcon(invitation.status)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {invitation.inviteeName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {invitation.inviteeEmail} •{' '}
                          {getInvitationStatusText(invitation.status)}
                        </p>
                      </div>
                    </div>
                    {invitation.status === 'pending' && invitation._id && (
                      <button
                        type="button"
                        onClick={() => handleCancelInvitation(invitation._id!)}
                        disabled={cancelingInvitationId === invitation._id}
                        className="text-sm text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {cancelingInvitationId === invitation._id
                          ? 'Canceling...'
                          : 'Cancel'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Co-speakers display */}
          <div className="space-y-3">
            {/* Co-speakers (can be removed) */}
            {coSpeakers.length > 0 && (
              <div>
                <div className="mt-1 space-y-2">
                  {coSpeakers.map((speaker) => (
                    <div
                      key={speaker._id}
                      className="flex items-center justify-between rounded-lg border bg-gray-50 p-3"
                    >
                      <div className="flex items-center space-x-3">
                        <SpeakerAvatars
                          speakers={[speaker]}
                          size="sm"
                          maxVisible={1}
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {speaker.name}
                          </p>
                          {speaker.title && (
                            <p className="text-xs text-gray-500">
                              {speaker.title}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSpeaker(speaker._id)}
                        className="text-red-500 transition-colors hover:text-red-700"
                        title="Remove co-speaker"
                        aria-label={`Remove ${speaker.name} as co-speaker`}
                      >
                        <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Email invitation section - only show if under the limit */}
          {totalCoSpeakers < maxCoSpeakers && (
            <div className="space-y-4">
              <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div>
                  <h4 className="mb-3 text-sm font-medium text-gray-900">
                    Invite Co-speakers
                  </h4>
                  <p className="mb-4 text-xs text-gray-500">
                    Enter email addresses to invite co-speakers. They&apos;ll
                    receive personalized invitations and create their own
                    speaker profiles when they accept.
                  </p>
                </div>

                {/* Dynamic invite fields */}
                <div className="space-y-3">
                  {inviteFields
                    .slice(0, maxCoSpeakers - totalCoSpeakers)
                    .map((field, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <div className="flex-1">
                          <label
                            htmlFor={`invite-email-${index}`}
                            className="block text-sm/6 font-medium text-gray-900"
                          >
                            Co-speaker {index + 1} Email
                          </label>
                          <div className="mt-2">
                            <input
                              type="email"
                              id={`invite-email-${index}`}
                              value={field.email}
                              onChange={(e) =>
                                handleFieldChange(index, e.target.value)
                              }
                              placeholder="their.email@example.com"
                              aria-label={`Co-speaker ${index + 1} Email`}
                              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-brand-cloud-blue sm:text-sm/6"
                            />
                          </div>
                        </div>
                        {field.email && (
                          <button
                            type="button"
                            onClick={() => clearField(index)}
                            className="mt-7 text-gray-400 hover:text-gray-600"
                            title={`Clear co-speaker ${index + 1} email`}
                          >
                            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ))}
                </div>

                {inviteError && (
                  <div className="text-sm text-red-600" role="alert">
                    {inviteError}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    They&apos;ll receive email invitations to join as your
                    co-speakers
                  </p>
                  <button
                    type="button"
                    onClick={handleSendInvitation}
                    disabled={
                      isSendingInvite ||
                      !inviteFields.some(
                        (field) =>
                          field.email.trim() && emailRegex.test(field.email),
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-md bg-brand-cloud-blue px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-brand-cloud-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSendingInvite ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                        Sending...
                      </>
                    ) : (
                      <>
                        <EnvelopeIcon className="h-4 w-4" aria-hidden="true" />
                        Send Invitation
                        {inviteFields.filter(
                          (f) => f.email.trim() && emailRegex.test(f.email),
                        ).length > 1
                          ? 's'
                          : ''}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Show limit reached message */}
          {totalCoSpeakers >= maxCoSpeakers && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-amber-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800">
                    Co-speaker limit reached
                  </h3>
                  <p className="mt-1 text-sm text-amber-700">
                    You have reached the maximum number of co-speakers (
                    {maxCoSpeakers}) for {formatName.toLowerCase()}s.
                    {maxCoSpeakers < 3 && (
                      <>
                        {' '}
                        If you need more co-speakers, consider changing to a
                        workshop format which allows up to 3 co-speakers.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
