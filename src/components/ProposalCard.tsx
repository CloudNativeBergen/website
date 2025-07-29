'use client'

import { ProposalExisting, Action, formats } from '@/lib/proposal/types'
import { CoSpeakerInvitation } from '@/lib/cospeaker/types'
import { InvitationBadges } from './InvitationBadges'
import { SpeakerAvatars } from './SpeakerAvatars'
import { PortableText } from '@portabletext/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { fetchInvitationsForProposal } from '@/lib/cospeaker/client'
import { Speaker } from '@/lib/speaker/types'
import {
  ClockIcon,
  UserGroupIcon,
  PencilSquareIcon,
  CheckIcon,
  TrashIcon,
  EyeIcon,
  ArrowUturnLeftIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid'

interface ProposalCardProps {
  proposal: ProposalExisting
  actionCallback?: (proposal: ProposalExisting, action: Action) => void
  readOnly?: boolean
  invitations?: CoSpeakerInvitation[]
  href?: string
  className?: string
}

export function ProposalCard({
  proposal,
  actionCallback,
  readOnly = false,
  invitations: initialInvitations,
  href,
  className = '',
}: ProposalCardProps) {
  const [invitations, setInvitations] = useState<CoSpeakerInvitation[]>(
    initialInvitations || [],
  )
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false)

  // Load invitations if not provided
  useEffect(() => {
    if (!initialInvitations && proposal._id) {
      setIsLoadingInvitations(true)
      fetchInvitationsForProposal(proposal._id)
        .then(setInvitations)
        .catch(console.error)
        .finally(() => setIsLoadingInvitations(false))
    }
  }, [proposal._id, initialInvitations])

  // Ensure speakers is an array of Speaker objects
  const speakers = Array.isArray(proposal.speakers)
    ? proposal.speakers.filter(
        (s): s is Speaker => typeof s === 'object' && '_id' in s && 'name' in s,
      )
    : []

  const formatDisplay = formats.get(proposal.format) || proposal.format
  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    submitted: 'bg-blue-100 text-blue-700',
    accepted: 'bg-green-100 text-green-700',
    confirmed: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    withdrawn: 'bg-orange-100 text-orange-700',
    deleted: 'bg-gray-100 text-gray-700',
  }

  // Action button handlers
  const handleView = () => actionCallback?.(proposal, Action.view)
  const handleEdit = () => actionCallback?.(proposal, Action.edit)
  const handleSubmit = () => actionCallback?.(proposal, Action.submit)
  const handleConfirm = () => actionCallback?.(proposal, Action.confirm)
  const handleWithdraw = () => actionCallback?.(proposal, Action.withdraw)
  const handleDelete = () => actionCallback?.(proposal, Action.delete)
  const handleUnsubmit = () => actionCallback?.(proposal, Action.unsubmit)

  const content = (
    <div className="flex h-full flex-col">
      {/* Main content area */}
      <div className="flex-grow">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-start justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {proposal.title}
            </h3>
            <span
              className={`ml-2 inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                statusColors[proposal.status] || statusColors.draft
              }`}
              role="status"
              aria-label={`Proposal status: ${proposal.status}`}
            >
              {proposal.status.charAt(0).toUpperCase() +
                proposal.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Speakers and Co-speakers */}
        <div className="mb-4 space-y-3">
          {/* Primary speakers */}
          {speakers.length > 0 && (
            <div className="flex items-center gap-3">
              <SpeakerAvatars speakers={speakers} size="sm" maxVisible={3} />
              <div className="text-sm text-gray-600">
                {speakers.map((s: Speaker) => s.name).join(', ')}
              </div>
            </div>
          )}

          {/* Invitation badges - only show non-accepted invitations */}
          {(() => {
            const pendingInvitations = invitations.filter(
              (inv) => inv.status !== 'accepted',
            )
            return (
              (pendingInvitations.length > 0 || isLoadingInvitations) && (
                <div className="flex items-center gap-2">
                  <UserGroupIcon
                    className="h-4 w-4 text-gray-400"
                    aria-hidden="true"
                  />
                  {isLoadingInvitations ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-gray-400"></div>
                      Loading invitations...
                    </div>
                  ) : (
                    <InvitationBadges invitations={pendingInvitations} size="sm" />
                  )}
                </div>
              )
            )
          })()}
        </div>

        {/* Metadata */}
        <div className="mb-4 flex flex-wrap gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <ClockIcon className="h-4 w-4" aria-hidden="true" />
            <span>{formatDisplay}</span>
          </div>
        </div>

        {/* Description preview */}
        {proposal.description && (
          <div className="mb-4">
            <div className="prose prose-sm line-clamp-3 max-w-none text-gray-600">
              <PortableText value={proposal.description} />
            </div>
          </div>
        )}
      </div>

      {/* Action buttons - centered at bottom */}
      {actionCallback && (
        <div className="mt-4 flex items-center justify-center gap-2 border-t pt-4">
          {/* View button for all proposals */}
          <button
            onClick={handleView}
            className="flex items-center gap-1 rounded px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            aria-label={`View proposal: ${proposal.title}`}
          >
            <EyeIcon className="h-3 w-3" aria-hidden="true" />
            View
          </button>

          {!readOnly && (
            <>
              {/* Draft proposals: can edit, submit, and delete */}
              {proposal.status === 'draft' && (
                <>
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-1 rounded px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                    aria-label={`Edit proposal: ${proposal.title}`}
                  >
                    <PencilSquareIcon className="h-3 w-3" aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="flex items-center gap-1 rounded px-3 py-2 text-sm font-medium text-green-600 hover:bg-green-50"
                    aria-label={`Submit proposal: ${proposal.title}`}
                  >
                    <CheckIcon className="h-3 w-3" aria-hidden="true" />
                    Submit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1 rounded px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    aria-label={`Delete proposal: ${proposal.title}`}
                  >
                    <TrashIcon className="h-3 w-3" aria-hidden="true" />
                    Delete
                  </button>
                </>
              )}

              {/* Submitted proposals: can edit and unsubmit */}
              {proposal.status === 'submitted' && (
                <>
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-1 rounded px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                    aria-label={`Edit proposal: ${proposal.title}`}
                  >
                    <PencilSquareIcon className="h-3 w-3" aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    onClick={handleUnsubmit}
                    className="flex items-center gap-1 rounded px-3 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50"
                    aria-label={`Unsubmit proposal: ${proposal.title}`}
                  >
                    <ArrowUturnLeftIcon
                      className="h-3 w-3"
                      aria-hidden="true"
                    />
                    Unsubmit
                  </button>
                </>
              )}

              {/* Accepted proposals: can confirm or withdraw */}
              {proposal.status === 'accepted' && (
                <>
                  <button
                    onClick={handleConfirm}
                    className="flex items-center gap-1 rounded px-3 py-2 text-sm font-medium text-green-600 hover:bg-green-50"
                    aria-label={`Confirm attendance for proposal: ${proposal.title}`}
                  >
                    <CheckIcon className="h-3 w-3" aria-hidden="true" />
                    Confirm
                  </button>
                  <button
                    onClick={handleWithdraw}
                    className="flex items-center gap-1 rounded px-3 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50"
                    aria-label={`Withdraw proposal: ${proposal.title}`}
                  >
                    <XMarkIcon className="h-3 w-3" aria-hidden="true" />
                    Withdraw
                  </button>
                </>
              )}

              {/* Confirmed proposals: can withdraw */}
              {proposal.status === 'confirmed' && (
                <button
                  onClick={handleWithdraw}
                  className="flex items-center gap-1 rounded px-3 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50"
                  aria-label={`Withdraw proposal: ${proposal.title}`}
                >
                  <XMarkIcon className="h-3 w-3" aria-hidden="true" />
                  Withdraw
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={`block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-gray-300 hover:shadow-md ${className}`}
      >
        {content}
      </Link>
    )
  }

  return (
    <div
      className={`flex h-full min-h-[300px] flex-col rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-gray-300 hover:shadow-md ${className}`}
    >
      {content}
    </div>
  )
}
