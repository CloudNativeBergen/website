import React, { useState } from 'react'
import Link from 'next/link'
import {
  ClockIcon,
  CalendarIcon,
  MapIcon,
  PlayIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { TrackTalk } from '@/lib/conference/types'
import { Status } from '@/lib/proposal/types'
import { formatSpeakerNamesFromUnknown } from '@/lib/speaker/formatSpeakerNames'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import { BookmarkButton } from '@/components/BookmarkButton'
import { useBookmarks } from '@/contexts/BookmarksContext'
import {
  FormatBadge,
  LevelBadge,
  AudienceBadge,
  LevelIndicator,
} from '@/lib/proposal/ui/badges'
import clsx from 'clsx'

// TypeScript interfaces for PortableText content
interface PortableTextChild {
  _type: string
  text?: string
}

interface TalkCardProps {
  talk: TrackTalk & {
    scheduleDate: string
    trackTitle: string
    trackIndex: number
  }
  showDate?: boolean
  showTrack?: boolean
  compact?: boolean
  fixedHeight?: boolean
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

const formatTime = (time: string): string => {
  return time
}

// Calculate duration in minutes between two time strings
const calculateDurationMinutes = (
  startTime: string,
  endTime: string,
): number => {
  const start = new Date(`2000-01-01T${startTime}:00`)
  const end = new Date(`2000-01-01T${endTime}:00`)
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60))
}

export function TalkCard({
  talk,
  showDate = false,
  showTrack = false,
  compact = false,
  fixedHeight = false,
}: TalkCardProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const { isBookmarked, isLoaded } = useBookmarks()
  const durationMinutes = calculateDurationMinutes(talk.startTime, talk.endTime)

  // Use smart height calculation for schedule view
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getSmartHeight = (duration: number): string => {
    if (!fixedHeight) return 'auto'

    // Service sessions (placeholder sessions) should be shorter
    if (!talk.talk) {
      return compact ? '4rem' : '8rem' // Half height for service sessions
    }

    // Regular talks get full height for schedule view compact cards
    return compact ? '8rem' : '16rem' // Normal height for talks
  }

  // Handle placeholder/service sessions
  if (!talk.talk) {
    const minHeight = getSmartHeight(durationMinutes)

    return (
      <div
        className={clsx(
          'rounded-lg border border-brand-frosted-steel bg-brand-sky-mist',
          compact ? 'p-2' : 'p-4',
        )}
        style={fixedHeight ? { minHeight } : {}}
      >
        <div className="flex h-full items-center justify-between">
          <div className="flex-1">
            <h3
              className={clsx(
                'font-space-grotesk font-medium text-brand-slate-gray',
                compact ? 'text-sm' : 'text-base',
              )}
            >
              {talk.placeholder || 'Service Session'}
            </h3>
            <div
              className={clsx(
                'flex flex-wrap items-center gap-2 text-gray-600',
                compact ? 'mt-1 text-xs' : 'mt-2 text-sm',
              )}
            >
              <div className="flex items-center gap-1">
                <ClockIcon className="h-3 w-3" />
                <span className="font-mono">
                  {formatTime(talk.startTime)} - {formatTime(talk.endTime)}
                </span>
              </div>
              {showDate && (
                <div className="flex items-center gap-1">
                  <CalendarIcon className="h-4 w-4" />
                  <span>{formatDate(talk.scheduleDate)}</span>
                </div>
              )}
              {showTrack && (
                <div className="flex items-center gap-1">
                  <MapIcon className="h-4 w-4" />
                  <span>{talk.trackTitle}</span>
                </div>
              )}
              <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-gray-700">
                {durationMinutes} min
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const { talk: talkData } = talk
  const primarySpeaker = talkData.speakers?.[0]
  const minHeight = getSmartHeight(durationMinutes)

  // Check if talk is confirmed
  const isConfirmed = talkData.status === Status.confirmed

  // Check if talk is withdrawn or rejected
  const isWithdrawnOrRejected =
    talkData.status === Status.withdrawn || talkData.status === Status.rejected

  // Create bookmark data for this talk
  const bookmarkData = {
    talkId:
      talkData._id ||
      `${talk.scheduleDate}-${talk.trackTitle}-${talk.startTime}`,
    title: isConfirmed ? talkData.title : 'Talk details to be announced',
    startTime: talk.startTime,
    endTime: talk.endTime,
    scheduleDate: talk.scheduleDate,
    trackTitle: talk.trackTitle,
    speakers: isConfirmed
      ? talkData.speakers
          ?.map((speaker) =>
            typeof speaker === 'object' && 'name' in speaker
              ? speaker.name
              : '',
          )
          .filter(Boolean)
      : [],
  }

  const isBookmarkedTalk = isLoaded && isBookmarked(bookmarkData.talkId)

  return (
    <div
      className={clsx(
        'rounded-lg border transition-all duration-200 hover:shadow-md',
        !isConfirmed && !isWithdrawnOrRejected && 'opacity-75', // Reduce opacity for unconfirmed talks
        isWithdrawnOrRejected && 'opacity-60', // More reduced opacity for withdrawn/rejected
        isBookmarkedTalk
          ? 'border-brand-cloud-blue bg-blue-50 hover:border-brand-cloud-blue/80'
          : isConfirmed
            ? 'border-brand-frosted-steel bg-white hover:border-brand-cloud-blue'
            : isWithdrawnOrRejected
              ? 'border-red-300 bg-red-50 hover:border-red-400' // Red styling for withdrawn/rejected
              : 'border-gray-300 bg-gray-50 hover:border-gray-400', // Different styling for unconfirmed
        compact ? 'p-3' : 'p-6',
      )}
      style={fixedHeight ? { minHeight } : {}}
    >
      <div
        className={clsx(
          'flex h-full flex-col',
          compact ? 'space-y-2' : 'space-y-4',
        )}
      >
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3
                className={clsx(
                  'font-space-grotesk font-semibold',
                  isWithdrawnOrRejected && 'text-red-500', // Red text for withdrawn/rejected
                  !isConfirmed && !isWithdrawnOrRejected && 'text-gray-500', // Grayed out for unconfirmed
                  isConfirmed && 'text-brand-slate-gray',
                  compact ? 'text-sm leading-tight' : 'text-base',
                  fixedHeight && compact && 'line-clamp-2', // Clamp to 2 lines for schedule view
                )}
              >
                {isConfirmed ? (
                  primarySpeaker &&
                  typeof primarySpeaker === 'object' &&
                  'slug' in primarySpeaker ? (
                    <Link
                      href={`/speaker/${primarySpeaker.slug}`}
                      className="transition-colors hover:text-brand-cloud-blue"
                    >
                      {talkData.title}
                    </Link>
                  ) : (
                    talkData.title
                  )
                ) : isWithdrawnOrRejected ? (
                  <span className="flex items-center gap-2">
                    <span>This session has been cancelled</span>
                    <span className="inline-flex items-center gap-1 rounded bg-red-100 px-6 py-1 text-xs font-medium whitespace-nowrap text-red-800">
                      <XMarkIcon className="h-3 w-3" />
                      Cancelled
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span>Talk details to be announced</span>
                    <span className="inline-flex items-center gap-1 rounded bg-yellow-100 px-6 py-1 text-xs font-medium whitespace-nowrap text-yellow-800">
                      <ClockIcon className="h-3 w-3" />
                      To be announced
                    </span>
                  </span>
                )}
              </h3>

              {/* Speaker Info */}
              {isConfirmed &&
                talkData.speakers &&
                talkData.speakers.length > 0 && (
                  <div
                    className={clsx(
                      'flex items-center gap-2',
                      compact ? 'mt-1' : 'mt-2',
                    )}
                  >
                    <SpeakerAvatars
                      speakers={talkData.speakers}
                      maxVisible={compact ? 2 : 3}
                      size="sm"
                    />
                    <div
                      className={clsx(
                        'min-w-0 flex-1',
                        compact ? 'text-xs' : 'text-sm',
                      )}
                    >
                      <div className="truncate font-medium text-brand-cloud-blue">
                        {formatSpeakerNamesFromUnknown(talkData.speakers)}
                      </div>
                    </div>
                  </div>
                )}

              {/* Placeholder for unconfirmed talks */}
              {!isConfirmed && !isWithdrawnOrRejected && (
                <div
                  className={clsx(
                    'flex items-center gap-2',
                    compact ? 'mt-1' : 'mt-2',
                  )}
                >
                  <div className="flex -space-x-2">
                    <div className="h-8 w-8 rounded-full bg-gray-300"></div>
                    <div className="h-8 w-8 rounded-full bg-gray-200"></div>
                  </div>
                  <div
                    className={clsx(
                      'min-w-0 flex-1',
                      compact ? 'text-xs' : 'text-sm',
                    )}
                  >
                    <div className="font-medium text-gray-400">
                      Speaker to be announced
                    </div>
                  </div>
                </div>
              )}

              {/* Placeholder for withdrawn/rejected talks */}
              {isWithdrawnOrRejected && (
                <div
                  className={clsx(
                    'flex items-center gap-2',
                    compact ? 'mt-1' : 'mt-2',
                  )}
                >
                  <div className="flex -space-x-2">
                    <div className="h-8 w-8 rounded-full bg-red-200"></div>
                    <div className="h-8 w-8 rounded-full bg-red-100"></div>
                  </div>
                  <div
                    className={clsx(
                      'min-w-0 flex-1',
                      compact ? 'text-xs' : 'text-sm',
                    )}
                  >
                    <div className="font-medium text-red-400">
                      Session cancelled
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Video Indicator */}
            <div className="flex items-center gap-2">
              {isConfirmed && talkData.video && (
                <div className="rounded-full bg-red-100 p-2 text-red-800">
                  <PlayIcon className="h-4 w-4" />
                </div>
              )}

              {/* Bookmark Button - only show for confirmed talks */}
              {isConfirmed && (
                <BookmarkButton
                  talk={bookmarkData}
                  size={compact ? 'sm' : 'md'}
                />
              )}
            </div>
          </div>
        </div>

        {/* Description - only show for confirmed talks */}
        {!compact &&
          isConfirmed &&
          talkData.description &&
          Array.isArray(talkData.description) && (
            <div className="flex-1">
              <div
                className={clsx(
                  'text-sm text-gray-600 transition-all duration-200',
                  !isDescriptionExpanded && 'line-clamp-3',
                )}
              >
                {talkData.description.map((block, index) => {
                  if (
                    block._type === 'block' &&
                    Array.isArray(block.children)
                  ) {
                    return (
                      <p key={index} className={index > 0 ? 'mt-2' : ''}>
                        {block.children
                          .filter(
                            (child: PortableTextChild) =>
                              child._type === 'span',
                          )
                          .map((child: PortableTextChild) => child.text)
                          .join(' ')}
                      </p>
                    )
                  }
                  return null
                })}
              </div>

              {/* Show/Hide More Button */}
              {talkData.description.length > 0 && (
                <button
                  onClick={() =>
                    setIsDescriptionExpanded(!isDescriptionExpanded)
                  }
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-cloud-blue transition-colors hover:text-brand-cloud-blue/80"
                >
                  {isDescriptionExpanded ? (
                    <>
                      <span>Show less</span>
                      <ChevronUpIcon className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      <span>Show more</span>
                      <ChevronDownIcon className="h-3 w-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          )}

        {/* Placeholder description for unconfirmed talks */}
        {!compact && !isConfirmed && !isWithdrawnOrRejected && (
          <div className="flex-1">
            <div className="text-sm text-gray-400 italic">
              Talk description will be available once the speaker confirms their
              participation.
            </div>
          </div>
        )}

        {/* Placeholder description for withdrawn/rejected talks */}
        {!compact && isWithdrawnOrRejected && (
          <div className="flex-1">
            <div className="text-sm text-red-400 italic">
              This session has been cancelled and will not be part of the
              program.
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className={clsx(compact ? 'space-y-2' : 'space-y-3')}>
          {/* Time and Location */}
          <div
            className={clsx(
              'flex flex-wrap items-center gap-2 text-gray-600',
              compact ? 'text-xs' : 'text-sm',
            )}
          >
            <div className="flex items-center gap-1">
              <ClockIcon className="h-3 w-3" />
              <span className="font-mono">
                {formatTime(talk.startTime)} - {formatTime(talk.endTime)}
              </span>
            </div>
            {showDate && (
              <div className="flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                <span>{formatDate(talk.scheduleDate)}</span>
              </div>
            )}
            {showTrack && (
              <div className="flex items-center gap-1">
                <MapIcon className="h-3 w-3" />
                <span>{talk.trackTitle}</span>
              </div>
            )}
            <span
              className={clsx(
                'rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700',
                compact ? 'text-xs' : 'text-xs',
              )}
            >
              {durationMinutes} min
            </span>
          </div>

          {/* Badges - only show for confirmed talks */}
          {!compact && isConfirmed && (
            <div className="flex flex-wrap gap-2">
              {/* Format Badge */}
              {talkData.format && (
                <FormatBadge format={talkData.format} variant="compact" />
              )}

              {/* Level Badge with Indicator */}
              {talkData.level && (
                <div className="flex items-center gap-1">
                  <LevelIndicator level={talkData.level} size="sm" />
                  <LevelBadge level={talkData.level} variant="compact" />
                </div>
              )}

              {/* Audience Badge (first one only to save space) */}
              {talkData.audiences && talkData.audiences.length > 0 && (
                <div className="flex items-center gap-1">
                  <AudienceBadge
                    audience={talkData.audiences[0]}
                    variant="compact"
                  />
                  {talkData.audiences.length > 1 && (
                    <span className="text-xs text-gray-500">
                      +{talkData.audiences.length - 1}
                    </span>
                  )}
                </div>
              )}

              {/* Topics (first one only) */}
              {talkData.topics && talkData.topics.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                    {typeof talkData.topics[0] === 'object' &&
                      'title' in talkData.topics[0] &&
                      talkData.topics[0].title}
                  </span>
                  {talkData.topics.length > 1 && (
                    <span className="text-xs text-gray-500">
                      +{talkData.topics.length - 1}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Basic info for unconfirmed talks */}
          {!compact && !isConfirmed && !isWithdrawnOrRejected && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                Details pending
              </span>
            </div>
          )}

          {/* Basic info for withdrawn/rejected talks */}
          {!compact && isWithdrawnOrRejected && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-600">
                <XMarkIcon className="h-3 w-3" />
                Session cancelled
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
