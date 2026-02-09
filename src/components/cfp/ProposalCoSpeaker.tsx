import { Speaker } from '@/lib/speaker/types'
import { Format } from '@/lib/proposal/types'
import {
  XMarkIcon,
  EnvelopeIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import {
  CoSpeakerInvitationMinimal,
  InvitationStatus,
} from '@/lib/cospeaker/types'
import {
  getCoSpeakerLimit,
  allowsCoSpeakers,
  getSpeakerLimitDescription,
} from '@/lib/cospeaker/constants'
import { useInviteFields, useInvitations } from '@/lib/cospeaker/hooks'
import { useState } from 'react'

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

interface ProposalCoSpeakerProps {
  selectedSpeakers: Speaker[]
  onSpeakersChange: (speakers: Speaker[]) => void
  format: Format
  proposalId?: string
  pendingInvitations?: CoSpeakerInvitationMinimal[]
  onInvitationSent?: (invitation: CoSpeakerInvitationMinimal) => void
  onInvitationCanceled?: (invitationId: string) => void
}

export function ProposalCoSpeaker({
  selectedSpeakers,
  onSpeakersChange,
  format,
  proposalId,
  pendingInvitations = [],
  onInvitationSent,
  onInvitationCanceled,
}: ProposalCoSpeakerProps) {
  const maxCoSpeakers = getCoSpeakerLimit(format)
  const formatName = getFormatDisplayName(format)
  const isLightningTalk = !allowsCoSpeakers(format)

  const {
    inviteFields,
    handleFieldChange,
    clearField,
    getValidInviteFields,
    isAnyFieldFilled,
    setInviteFields,
  } = useInviteFields(format)

  const {
    isSendingInvite,
    inviteError,
    inviteSuccess,
    cancelingInvitationId,
    sendInvites,
    cancelInvite,
  } = useInvitations(onInvitationSent, onInvitationCanceled)

  const [missingProposalError, setMissingProposalError] = useState('')

  const coSpeakers = selectedSpeakers

  const totalCoSpeakers =
    coSpeakers.length +
    pendingInvitations.filter((inv) => inv.status === 'pending').length

  const handleRemoveSpeaker = (speakerId: string) => {
    const newSpeakers = selectedSpeakers.filter((s) => s._id !== speakerId)
    onSpeakersChange(newSpeakers)
  }

  const handleCancelInvitation = async (invitationId: string) => {
    if (!proposalId) return
    await cancelInvite(proposalId, invitationId)
  }

  const handleSendInvitation = async () => {
    const validFields = getValidInviteFields()

    if (!proposalId) {
      setMissingProposalError(
        'Please save your proposal as a draft before inviting co-speakers.',
      )
      return
    }

    setMissingProposalError('')
    const sentInvitations = await sendInvites(proposalId, validFields)

    if (sentInvitations.length > 0) {
      const sentEmails = validFields.map((field) => field.email)
      setInviteFields((prev) =>
        prev.map((field) => {
          const wasSent = sentEmails.includes(field.email)
          return wasSent ? { email: '', name: '' } : field
        }),
      )
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
        <label className="block text-sm leading-6 font-medium text-gray-900 dark:text-white">
          Co-speakers
        </label>
        <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
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

      {isLightningTalk && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-4 dark:border-orange-800/50 dark:bg-orange-900/20">
          <div className="flex">
            <div className="shrink-0">
              <svg
                className="h-5 w-5 text-orange-400 dark:text-orange-500"
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
              <h3
                className="text-sm font-medium text-orange-800 dark:text-orange-200"
                role="alert"
              >
                Co-speakers not available for lightning talks
              </h3>
              <p className="mt-1 text-sm text-orange-700 dark:text-orange-300">
                Lightning talks are designed as single-speaker presentations. If
                you need to present with co-speakers, please select a different
                talk format (20-minute, 25-minute, 40-minute, or 45-minute
                presentation).
              </p>
            </div>
          </div>
        </div>
      )}

      {!isLightningTalk && (
        <>
          {inviteSuccess && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800/50 dark:bg-green-900/20">
              <div className="flex">
                <div className="shrink-0">
                  <CheckCircleIcon
                    className="text-fresh-green h-5 w-5 dark:text-green-400"
                    aria-hidden="true"
                  />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    {inviteSuccess}
                  </p>
                </div>
              </div>
            </div>
          )}

          {pendingInvitations.length > 0 && (
            <div>
              <h4 className="text-cloud-blue-dark mb-2 text-sm font-medium dark:text-blue-400">
                Pending Invitations
              </h4>
              <div className="space-y-2">
                {pendingInvitations.map((invitation) => (
                  <div
                    key={invitation._id}
                    className="flex items-center justify-between rounded-lg border bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="shrink-0">
                        {getInvitationStatusIcon(invitation.status)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {invitation.invitedName || invitation.invitedEmail}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {invitation.invitedEmail} •{' '}
                          {getInvitationStatusText(invitation.status)}
                        </p>
                      </div>
                    </div>
                    {invitation.status === 'pending' && invitation._id && (
                      <button
                        type="button"
                        onClick={() => handleCancelInvitation(invitation._id!)}
                        disabled={cancelingInvitationId === invitation._id}
                        className="text-sm text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
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

          <div className="space-y-3">
            {coSpeakers.length > 0 && (
              <div>
                <div className="mt-1 space-y-2">
                  {coSpeakers.map((speaker) => (
                    <div
                      key={speaker._id}
                      className="flex items-center justify-between rounded-lg border bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700"
                    >
                      <div className="flex items-center space-x-3">
                        <SpeakerAvatars
                          speakers={[speaker]}
                          size="sm"
                          maxVisible={1}
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {speaker.name}
                          </p>
                          {speaker.title && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {speaker.title}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSpeaker(speaker._id)}
                        className="text-red-500 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
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

          {totalCoSpeakers < maxCoSpeakers && (
            <div className="space-y-4">
              <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-800">
                <div>
                  <h4 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
                    Invite Co-speakers
                  </h4>
                  <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                    Enter email addresses to invite co-speakers. They&apos;ll
                    receive personalized invitations and create their own
                    speaker profiles when they accept.
                  </p>
                </div>

                <div className="space-y-4">
                  {inviteFields
                    .slice(0, maxCoSpeakers - totalCoSpeakers)
                    .map((field, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-700"
                      >
                        <div className="flex items-start justify-between">
                          <h5 className="text-sm font-medium text-gray-900 dark:text-white">
                            Co-speaker {index + 1}
                          </h5>
                          {(field.email || field.name) && (
                            <button
                              type="button"
                              onClick={() => clearField(index)}
                              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                              title={`Clear co-speaker ${index + 1} details`}
                            >
                              <XMarkIcon
                                className="h-5 w-5"
                                aria-hidden="true"
                              />
                            </button>
                          )}
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor={`invite-email-${index}`}
                              className="block text-sm font-medium text-gray-900 dark:text-white"
                            >
                              Email *
                            </label>
                            <div className="mt-1">
                              <input
                                type="email"
                                id={`invite-email-${index}`}
                                value={field.email}
                                onChange={(e) =>
                                  handleFieldChange(
                                    index,
                                    'email',
                                    e.target.value,
                                  )
                                }
                                placeholder="their.email@example.com"
                                aria-label={`Co-speaker ${index + 1} Email`}
                                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-brand-cloud-blue sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                              />
                            </div>
                          </div>
                          <div>
                            <label
                              htmlFor={`invite-name-${index}`}
                              className="block text-sm font-medium text-gray-900 dark:text-white"
                            >
                              Name (optional)
                            </label>
                            <div className="mt-1">
                              <input
                                type="text"
                                id={`invite-name-${index}`}
                                value={field.name}
                                onChange={(e) =>
                                  handleFieldChange(
                                    index,
                                    'name',
                                    e.target.value,
                                  )
                                }
                                placeholder="Their Name"
                                aria-label={`Co-speaker ${index + 1} Name`}
                                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-brand-cloud-blue sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>

                {(inviteError || missingProposalError) && (
                  <div
                    className="text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {inviteError || missingProposalError}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    They&apos;ll receive email invitations to join as your
                    co-speakers
                  </p>
                  <button
                    type="button"
                    onClick={handleSendInvitation}
                    disabled={isSendingInvite || !isAnyFieldFilled()}
                    className="inline-flex items-center gap-2 rounded-md bg-brand-cloud-blue px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-brand-cloud-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus-visible:outline-blue-500"
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
                        {getValidInviteFields().length > 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {totalCoSpeakers >= maxCoSpeakers && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/20">
              <div className="flex">
                <div className="shrink-0">
                  <svg
                    className="h-5 w-5 text-amber-400 dark:text-amber-500"
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
                  <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Co-speaker limit reached
                  </h3>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                    You have reached the maximum number of co-speakers (
                    {maxCoSpeakers}) for {formatName.toLowerCase()}s.
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
