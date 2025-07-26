import React, { useState } from 'react'
import Link from 'next/link'
import {
  ClockIcon,
  CalendarIcon,
  MapIcon,
  PlayIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline'
import { TrackTalk } from '@/lib/conference/types'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import { BookmarkButton } from '@/components/BookmarkButton'
import { useBookmarks } from '@/hooks/useBookmarks'
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
  const getSmartHeight = (duration: number): string => {
    if (!fixedHeight) return 'auto'
    if (duration <= 30) return `${Math.max(duration * 0.8, 4)}rem`
    if (duration <= 60) return `${Math.max(24 + (duration - 30) * 0.6, 8)}rem`
    if (duration <= 120) return `${Math.max(42 + (duration - 60) * 0.4, 12)}rem`
    return `${Math.max(66 + (duration - 120) * 0.2, 16)}rem`
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
  const hasMultipleSpeakers = talkData.speakers && talkData.speakers.length > 1
  const minHeight = getSmartHeight(durationMinutes)

  // Create bookmark data for this talk
  const bookmarkData = {
    talkId:
      talkData._id ||
      `${talk.scheduleDate}-${talk.trackTitle}-${talk.startTime}`,
    title: talkData.title,
    startTime: talk.startTime,
    endTime: talk.endTime,
    scheduleDate: talk.scheduleDate,
    trackTitle: talk.trackTitle,
    speakers: talkData.speakers
      ?.map((speaker) =>
        typeof speaker === 'object' && 'name' in speaker ? speaker.name : '',
      )
      .filter(Boolean),
  }

  const isBookmarkedTalk = isLoaded && isBookmarked(bookmarkData.talkId)

  return (
    <div
      className={clsx(
        'rounded-lg border transition-all duration-200 hover:shadow-md',
        isBookmarkedTalk
          ? 'border-brand-cloud-blue bg-blue-50 hover:border-brand-cloud-blue/80'
          : 'border-brand-frosted-steel bg-white hover:border-brand-cloud-blue',
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
                  'font-space-grotesk font-semibold text-brand-slate-gray',
                  compact ? 'text-sm leading-tight' : 'text-base',
                )}
              >
                {primarySpeaker &&
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
                )}
              </h3>

              {/* Speaker Info */}
              {talkData.speakers && talkData.speakers.length > 0 && (
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
                    {primarySpeaker &&
                      typeof primarySpeaker === 'object' &&
                      'name' in primarySpeaker && (
                        <div className="truncate font-medium text-brand-cloud-blue">
                          {primarySpeaker.name}
                          {hasMultipleSpeakers && (
                            <span className="font-normal text-gray-500">
                              {' '}
                              +{talkData.speakers.length - 1} more
                            </span>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>

            {/* Video Indicator */}
            <div className="flex items-center gap-2">
              {talkData.video && (
                <div className="rounded-full bg-red-100 p-2 text-red-800">
                  <PlayIcon className="h-4 w-4" />
                </div>
              )}

              {/* Bookmark Button */}
              <BookmarkButton
                talk={bookmarkData}
                size={compact ? 'sm' : 'md'}
              />
            </div>
          </div>
        </div>

        {/* Description */}
        {!compact &&
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

          {/* Badges */}
          {!compact && (
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
        </div>
      </div>
    </div>
  )
}
