'use client'

import { UserIcon, ClockIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import {
  ProposalExisting,
  formats,
  levels,
  languages,
  audiences,
} from '@/lib/proposal/types'
import { SpeakerWithReviewInfo } from '@/lib/speaker/types'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import {
  StatusBadge,
  SpeakerIndicators,
  RatingDisplay,
  MetadataRow,
  getProposalSpeakerNames,
  calculateAverageRating,
} from '@/lib/proposal'

interface ProposalCardProps {
  proposal: ProposalExisting
  href?: string
  onSelect?: () => void
  isSelected?: boolean
}

/**
 * Individual proposal card component for admin interface
 * Displays proposal information with speaker image, metadata, and status
 */
export function ProposalCard({
  proposal,
  href,
  onSelect,
  isSelected = false,
}: ProposalCardProps) {
  const speakers =
    proposal.speakers && Array.isArray(proposal.speakers)
      ? proposal.speakers
          .filter(
            (speaker) =>
              typeof speaker === 'object' && speaker && 'name' in speaker,
          )
          .map((speaker) => speaker as SpeakerWithReviewInfo)
      : []

  const averageRating = calculateAverageRating(proposal)
  const reviewCount = proposal.reviews?.length || 0
  const speakerNames = getProposalSpeakerNames(proposal)

  // Get current conference ID for speaker indicators
  const currentConferenceId =
    typeof proposal.conference === 'object' &&
    proposal.conference &&
    '_id' in proposal.conference
      ? proposal.conference._id
      : typeof proposal.conference === 'string'
        ? proposal.conference
        : undefined

  const CardContent = () => (
    <div className="flex items-start space-x-4">
      <div className="flex-shrink-0">
        {proposal.speakers &&
        Array.isArray(proposal.speakers) &&
        proposal.speakers.length > 0 ? (
          <SpeakerAvatars
            speakers={proposal.speakers}
            size="md"
            maxVisible={3}
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <UserIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="focus:outline-none">
          {/* Header row with title and status */}
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 flex-1 text-sm font-medium text-gray-900 dark:text-white">
              {proposal.title}
            </h3>
            <StatusBadge
              status={proposal.status}
              variant="compact"
              className="flex-shrink-0"
            />
          </div>

          {/* Speaker name with indicators */}
          <div className="mb-2 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <div className="flex min-w-0 flex-1 items-center">
              <span className="truncate font-medium">{speakerNames}</span>
            </div>

            {/* Speaker Indicators */}
            {speakers.length > 0 && (
              <div className="ml-2">
                <SpeakerIndicators
                  speakers={speakers}
                  size="md"
                  maxVisible={5}
                  currentConferenceId={currentConferenceId}
                />
              </div>
            )}
          </div>

          {/* Metadata in compact rows */}
          <div className="space-y-1">
            <MetadataRow icon={ClockIcon}>
              {formats.get(proposal.format) ||
                proposal.format ||
                'Not specified'}
            </MetadataRow>

            {/* Rating display */}
            <RatingDisplay
              rating={averageRating}
              reviewCount={reviewCount}
              size="md"
              showText={true}
            />

            <div className="text-xs text-gray-500 dark:text-gray-400">
              {levels.get(proposal.level) ||
                proposal.level ||
                'Level not specified'}{' '}
              •{' '}
              {languages.get(proposal.language) ||
                proposal.language ||
                'Language not specified'}
            </div>

            {proposal.audiences && proposal.audiences.length > 0 && (
              <div className="line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                Audience:{' '}
                {proposal.audiences
                  .map((aud) => audiences.get(aud) || aud)
                  .join(', ')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const baseCardClasses =
    'relative rounded-lg border bg-white px-6 py-5 shadow-sm transition-all duration-200 dark:bg-gray-800'
  const cardClasses = `${baseCardClasses} ${
    isSelected
      ? 'border-indigo-500 bg-indigo-50 shadow-md dark:border-indigo-400 dark:bg-indigo-900/20'
      : 'border-gray-300 hover:border-gray-400 hover:shadow-md dark:border-gray-600 dark:hover:border-gray-500'
  } ${onSelect ? 'cursor-pointer' : ''}`

  const handleClick = (e: React.MouseEvent) => {
    // On large screens (lg+), if onSelect is provided, use preview mode
    const isLargeScreen = window.innerWidth >= 1024 // lg breakpoint
    if (onSelect && isLargeScreen) {
      e.preventDefault()
      onSelect()
    }
    // On smaller screens, let the Link handle navigation naturally
  }

  return (
    <Link href={href || '#'} className={cardClasses} onClick={handleClick}>
      <CardContent />
      {onSelect && (
        <div className="absolute top-3 left-3 hidden lg:block">
          <div
            className={`h-2 w-2 rounded-full ${
              isSelected
                ? 'bg-indigo-500 dark:bg-indigo-400'
                : 'bg-gray-300 dark:bg-gray-600'
            }`}
          />
        </div>
      )}
    </Link>
  )
}
