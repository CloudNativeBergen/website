'use client'

import Link from 'next/link'
import {
  PencilIcon,
  ChatBubbleBottomCenterTextIcon,
  VideoCameraIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
} from '@heroicons/react/24/outline'
import {
  CheckBadgeIcon,
  XCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  SparklesIcon,
} from '@heroicons/react/24/solid'
import type { ProposalExisting, Status } from '@/lib/proposal/types'
import { statuses } from '@/lib/proposal/types'
import { formatConfig } from '@/lib/proposal'
import { hasProposalVideo } from '@/lib/proposal/video'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import { useImpersonateQueryString } from '@/lib/impersonation'
import { StatusBadge } from '@/components/StatusBadge'

type BadgeColor =
  | 'gray'
  | 'red'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'orange'

interface CompactProposalListProps {
  proposals: ProposalExisting[]
  canEdit: boolean
  conferenceHasEnded?: boolean
}

function getProposalStatusConfig(
  status: Status,
  hasApprovedTalk: boolean,
): {
  color: BadgeColor
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
} {
  switch (status) {
    case 'confirmed':
      return { color: 'green', icon: CheckBadgeIcon, label: 'Confirmed' }
    case 'accepted':
      return { color: 'blue', icon: SparklesIcon, label: 'Accepted' }
    case 'submitted':
      return { color: 'yellow', icon: ClockIcon, label: 'Submitted' }
    case 'rejected':
      return hasApprovedTalk
        ? { color: 'gray', icon: MinusCircleIcon, label: 'Not selected' }
        : { color: 'red', icon: XCircleIcon, label: 'Rejected' }
    case 'withdrawn':
      return { color: 'orange', icon: XCircleIcon, label: 'Withdrawn' }
    case 'draft':
      return { color: 'gray', icon: DocumentTextIcon, label: 'Draft' }
    default:
      return {
        color: 'gray',
        icon: DocumentTextIcon,
        label: statuses.get(status) || status,
      }
  }
}

export function CompactProposalList({
  proposals,
  canEdit,
  conferenceHasEnded = false,
}: CompactProposalListProps) {
  const queryString = useImpersonateQueryString()

  const hasApprovedTalk = proposals.some(
    (p) => p.status === 'confirmed' || p.status === 'accepted',
  )

  const sortedProposals = [...proposals].sort((a, b) => {
    const statusOrder: Record<Status, number> = {
      confirmed: 1,
      accepted: 2,
      submitted: 3,
      draft: 4,
      rejected: 5,
      withdrawn: 6,
      deleted: 7,
    }
    return statusOrder[a.status] - statusOrder[b.status]
  })

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
        Proposals ({proposals.length})
      </h4>
      <div className="space-y-2">
        {sortedProposals.map((proposal) => {
          const formatInfo = formatConfig[proposal.format]
          const FormatIcon = formatInfo?.icon
          const audienceFeedback = proposal.audienceFeedback
          const totalFeedback = audienceFeedback
            ? audienceFeedback.greenCount +
              audienceFeedback.yellowCount +
              audienceFeedback.redCount
            : 0
          const showFeedback =
            conferenceHasEnded &&
            (proposal.status === 'confirmed' ||
              proposal.status === 'accepted') &&
            totalFeedback > 0

          const isApproved =
            proposal.status === 'confirmed' || proposal.status === 'accepted'
          const isMuted =
            hasApprovedTalk &&
            !isApproved &&
            (proposal.status === 'rejected' ||
              proposal.status === 'withdrawn' ||
              proposal.status === 'submitted')

          const hasAttachments =
            proposal.attachments &&
            proposal.attachments.some((a) => a.attachmentType === 'slides')
          const showMissingAttachments = isApproved && !hasAttachments

          return (
            <div
              key={proposal._id}
              className={`flex flex-col gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors sm:flex-row sm:items-center sm:justify-between ${
                isMuted
                  ? 'border-gray-200/50 bg-gray-50/50 opacity-60 hover:opacity-80 dark:border-gray-700/50 dark:bg-gray-800/50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                {proposal.speakers && proposal.speakers.length > 0 && (
                  <SpeakerAvatars
                    speakers={proposal.speakers}
                    size="sm"
                    maxVisible={2}
                    showTooltip={true}
                  />
                )}
                {FormatIcon && (
                  <FormatIcon
                    className={`h-4 w-4 shrink-0 ${formatInfo.color || 'text-gray-500'}`}
                  />
                )}
                <Link
                  href={
                    canEdit
                      ? `/cfp/proposal?id=${proposal._id}${queryString ? `&${queryString.slice(1)}` : ''}`
                      : `/cfp/proposal/${proposal._id}${queryString}`
                  }
                  className={`flex-1 truncate font-medium hover:text-brand-cloud-blue dark:hover:text-blue-400 ${
                    isMuted
                      ? 'text-gray-600 dark:text-gray-400'
                      : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {proposal.title}
                </Link>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {showFeedback && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                    title="Audience feedback available"
                  >
                    <ChatBubbleBottomCenterTextIcon className="h-3 w-3" />
                    {totalFeedback}
                  </span>
                )}
                {hasProposalVideo(proposal) && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                    title="Video available"
                  >
                    <VideoCameraIcon className="h-3 w-3" />
                    Video
                  </span>
                )}
                {showMissingAttachments && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                    title="No presentation slides uploaded"
                  >
                    <ExclamationTriangleIcon className="h-3 w-3" />
                  </span>
                )}
                {(() => {
                  const config = getProposalStatusConfig(
                    proposal.status,
                    hasApprovedTalk,
                  )
                  return (
                    <StatusBadge
                      label={config.label}
                      color={config.color}
                      icon={config.icon}
                    />
                  )
                })()}
                {canEdit && (
                  <Link
                    href={`/cfp/proposal?id=${proposal._id}${queryString ? `&${queryString.slice(1)}` : ''}`}
                    className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    title="Edit proposal"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
