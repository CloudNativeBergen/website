'use client'

import Link from 'next/link'
import {
  PencilIcon,
  ChatBubbleBottomCenterTextIcon,
} from '@heroicons/react/24/outline'
import {
  CheckBadgeIcon,
  XCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  SparklesIcon,
  HandThumbDownIcon,
} from '@heroicons/react/24/solid'
import type { ProposalExisting, Status } from '@/lib/proposal/types'
import { statuses } from '@/lib/proposal/types'
import { formatConfig } from '@/lib/proposal'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import { useImpersonateQueryString } from '@/lib/impersonation'

interface CompactProposalListProps {
  proposals: ProposalExisting[]
  canEdit: boolean
  conferenceHasEnded?: boolean
}

function StatusBadge({ status }: { status: Status }) {
  const getStatusConfig = (status: Status) => {
    switch (status) {
      case 'confirmed':
        return {
          color:
            'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
          icon: CheckBadgeIcon,
          label: 'Confirmed',
        }
      case 'accepted':
        return {
          color:
            'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
          icon: SparklesIcon,
          label: 'Accepted',
        }
      case 'submitted':
        return {
          color:
            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
          icon: ClockIcon,
          label: 'Submitted',
        }
      case 'rejected':
        return {
          color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
          icon: HandThumbDownIcon,
          label: 'Rejected',
        }
      case 'withdrawn':
        return {
          color:
            'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
          icon: XCircleIcon,
          label: 'Withdrawn',
        }
      case 'draft':
        return {
          color:
            'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400',
          icon: DocumentTextIcon,
          label: 'Draft',
        }
      default:
        return {
          color:
            'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400',
          icon: DocumentTextIcon,
          label: statuses.get(status) || status,
        }
    }
  }

  const config = getStatusConfig(status)
  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${config.color}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
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

          return (
            <div
              key={proposal._id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                isMuted
                  ? 'border-gray-200/50 bg-gray-50/50 opacity-60 hover:opacity-80 dark:border-gray-700/50 dark:bg-gray-800/50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
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
                    className={`h-4 w-4 flex-shrink-0 ${formatInfo.color || 'text-gray-500'}`}
                  />
                )}
                <Link
                  href={`/cfp/proposal/${proposal._id}${queryString}`}
                  className={`flex-1 truncate font-medium hover:text-brand-cloud-blue dark:hover:text-blue-400 ${
                    isMuted
                      ? 'text-gray-600 dark:text-gray-400'
                      : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {proposal.title}
                </Link>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {showFeedback && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                    title="Audience feedback available"
                  >
                    <ChatBubbleBottomCenterTextIcon className="h-3 w-3" />
                    {totalFeedback}
                  </span>
                )}
                <StatusBadge status={proposal.status} />
                {canEdit && (
                  <Link
                    href={`/cfp/proposal/${proposal._id}${queryString}`}
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
