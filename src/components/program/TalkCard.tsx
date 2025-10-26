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
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import { ClickableSpeakerNames } from '@/components/ClickableSpeakerNames'
import { BookmarkButton } from '@/components/BookmarkButton'
import { useBookmarks } from '@/contexts/BookmarksContext'
import {
  FormatBadge,
  LevelBadge,
  AudienceBadge,
  LevelIndicator,
} from '@/lib/proposal/ui/badges'
import { TalkStatus } from '@/lib/program/time-utils'
import { formatConferenceDateShort } from '@/lib/time'
import clsx from 'clsx'

interface PortableTextChild {
  _type: string
  text?: string
}

function StatusIndicator({ status }: { status?: TalkStatus }) {
  if (status !== 'happening-now' && status !== 'happening-soon') return null

  return (
    <div className="absolute top-2 right-2 print:hidden" suppressHydrationWarning>
      <span className="relative flex h-3 w-3">
        <span
          className={clsx(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
            status === 'happening-now' ? 'bg-green-400' : 'bg-yellow-400',
          )}
        />
        <span
          className={clsx(
            'relative inline-flex h-3 w-3 rounded-full',
            status === 'happening-now' ? 'bg-green-500' : 'bg-yellow-500',
          )}
        />
      </span>
    </div>
  )
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
  status?: TalkStatus
}

const formatTime = (time: string): string => {
  return time
}

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
  status,
}: TalkCardProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const { isBookmarked, isLoaded } = useBookmarks()
  const durationMinutes = calculateDurationMinutes(talk.startTime, talk.endTime)

  const isPast = status === 'past'
  const isHappeningNow = status === 'happening-now'
  const isHappeningSoon = status === 'happening-soon'

  if (!talk.talk) {
    return (
      <div className="relative">
        <StatusIndicator status={status} />
        <div
          suppressHydrationWarning
          className={clsx(
            'rounded-lg border transition-all duration-200',
            isPast && 'opacity-60',
            isHappeningNow &&
            'border-2 border-green-500 bg-green-50 dark:bg-green-950/30',
            isHappeningSoon && 'border-2 border-yellow-500',
            !isHappeningNow &&
            !isHappeningSoon &&
            'border-brand-frosted-steel bg-brand-sky-mist dark:border-gray-600 dark:bg-gray-700',
            compact ? 'p-2' : 'p-4',
          )}
        >
          <div className="flex h-full items-center justify-between">
            <div className="flex-1">
              <h3
                className={clsx(
                  'font-space-grotesk font-medium text-brand-slate-gray dark:text-gray-200',
                  compact ? 'text-sm' : 'text-base',
                )}
              >
                {talk.placeholder || 'Service Session'}
              </h3>
              <div
                className={clsx(
                  'flex flex-wrap items-center gap-2 text-gray-600 dark:text-gray-400',
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
                    <span>{formatConferenceDateShort(talk.scheduleDate)}</span>
                  </div>
                )}
                {showTrack && (
                  <div className="flex items-center gap-1">
                    <MapIcon className="h-4 w-4" />
                    <span>{talk.trackTitle}</span>
                  </div>
                )}
                <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-600 dark:text-gray-300">
                  <span className="hidden sm:inline">
                    {durationMinutes} min
                  </span>
                  <span className="sm:hidden">{durationMinutes}m</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const { talk: talkData } = talk
  const primarySpeaker = talkData.speakers?.[0]
  const isConfirmed = talkData.status === Status.confirmed

  const isWithdrawnOrRejected =
    talkData.status === Status.withdrawn || talkData.status === Status.rejected

  const split = talkData.format?.split('_') || []
  const formatType = split[0]

  const bookmarkData = {
    talkId:
      talkData._id ||
      `${talk.scheduleDate}-${talk.trackTitle}-${talk.startTime}`,
    title: isConfirmed
      ? talkData.title
      : formatType === 'workshop'
        ? 'Workshop details to be announced'
        : 'Talk details to be announced',
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
      suppressHydrationWarning
      className={clsx(
        'relative rounded-lg border transition-all duration-200 hover:shadow-md',
        !isConfirmed && !isWithdrawnOrRejected && 'opacity-75',
        isWithdrawnOrRejected && 'opacity-60',
        isPast && !isWithdrawnOrRejected && 'opacity-60',
        isHappeningNow &&
        'border-2 border-green-500 bg-green-50 dark:bg-green-950/30',
        isHappeningSoon && 'border-2 border-yellow-500',
        isBookmarkedTalk && !isHappeningNow && !isHappeningSoon
          ? 'border-brand-cloud-blue bg-blue-50 hover:border-brand-cloud-blue/80 dark:border-brand-cloud-blue dark:bg-blue-900/30'
          : isConfirmed && !isHappeningNow && !isHappeningSoon
            ? 'border-brand-frosted-steel bg-white hover:border-brand-cloud-blue dark:border-gray-600 dark:bg-gray-800 dark:hover:border-brand-cloud-blue'
            : isWithdrawnOrRejected
              ? 'border-red-300 bg-red-50 hover:border-red-400 dark:border-red-600 dark:bg-red-900/30 dark:hover:border-red-500'
              : !isHappeningNow &&
              !isHappeningSoon &&
              'border-gray-300 bg-gray-50 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-gray-500',
        compact ? 'p-3' : 'p-6',
      )}
    >
      <StatusIndicator status={status} />
      <div
        className={clsx(
          'flex h-full flex-col',
          compact ? 'space-y-2' : 'space-y-4',
        )}
      >
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3
                className={clsx(
                  'font-space-grotesk font-semibold',
                  isWithdrawnOrRejected && 'text-red-500 dark:text-red-400',
                  !isConfirmed &&
                  !isWithdrawnOrRejected &&
                  'text-gray-500 dark:text-gray-400',
                  isConfirmed && 'text-brand-slate-gray dark:text-white',
                  compact ? 'text-sm leading-tight' : 'text-base',
                  fixedHeight && compact && 'line-clamp-2',
                )}
              >
                {isConfirmed ? (
                  primarySpeaker &&
                    typeof primarySpeaker === 'object' &&
                    'slug' in primarySpeaker ? (
                    <Link
                      href={`/speaker/${primarySpeaker.slug}`}
                      className="transition-colors hover:text-brand-cloud-blue dark:hover:text-blue-400"
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
                    <span>
                      <span className="hidden sm:inline">
                        Talk details to be announced
                      </span>
                      <span className="sm:hidden">Details TBA</span>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-yellow-100 px-2 py-1 text-xs font-medium whitespace-nowrap text-yellow-800">
                      <ClockIcon className="h-3 w-3" />
                      TBA
                    </span>
                  </span>
                )}
              </h3>

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
                        <ClickableSpeakerNames
                          speakers={talkData.speakers}
                          showFirstNameOnly={talkData.speakers.length > 1}
                          maxVisible={compact ? 2 : undefined}
                          linkClassName="hover:text-brand-cloud-blue/80 dark:hover:text-blue-400 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                )}

              {!isConfirmed && !isWithdrawnOrRejected && (
                <div
                  className={clsx(
                    'flex items-center gap-2',
                    compact ? 'mt-1' : 'mt-2',
                  )}
                >
                  <div className="flex -space-x-2">
                    <div className="h-8 w-8 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                    <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-500"></div>
                  </div>
                  <div
                    className={clsx(
                      'min-w-0 flex-1',
                      compact ? 'text-xs' : 'text-sm',
                    )}
                  >
                    <div className="font-medium text-gray-400 dark:text-gray-500">
                      <span className="hidden sm:inline">
                        Speaker to be announced
                      </span>
                      <span className="sm:hidden">Speaker TBA</span>
                    </div>
                  </div>
                </div>
              )}

              {isWithdrawnOrRejected && (
                <div
                  className={clsx(
                    'flex items-center gap-2',
                    compact ? 'mt-1' : 'mt-2',
                  )}
                >
                  <div className="flex -space-x-2">
                    <div className="h-8 w-8 rounded-full bg-red-200 dark:bg-red-800"></div>
                    <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-700"></div>
                  </div>
                  <div
                    className={clsx(
                      'min-w-0 flex-1',
                      compact ? 'text-xs' : 'text-sm',
                    )}
                  >
                    <div className="font-medium text-red-400 dark:text-red-300">
                      Session cancelled
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 print:hidden">
              {isConfirmed && talkData.video && (
                <div className="rounded-full bg-red-100 p-2 text-red-800 dark:bg-red-900/50 dark:text-red-300">
                  <PlayIcon className="h-4 w-4" />
                </div>
              )}

              {isConfirmed && !isHappeningNow && (
                <BookmarkButton
                  talk={bookmarkData}
                  size={compact ? 'sm' : 'md'}
                />
              )}
            </div>
          </div>
        </div>

        {!compact &&
          isConfirmed &&
          talkData.description &&
          Array.isArray(talkData.description) && (
            <div className="flex-1">
              <div
                className={clsx(
                  'text-sm text-gray-600 transition-all duration-200 dark:text-gray-300',
                  !isDescriptionExpanded && 'line-clamp-3',
                  'print:line-clamp-none',
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

              {talkData.description.length > 0 && (
                <button
                  onClick={() =>
                    setIsDescriptionExpanded(!isDescriptionExpanded)
                  }
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-cloud-blue transition-colors hover:text-brand-cloud-blue/80 dark:text-blue-400 dark:hover:text-blue-300 print:hidden"
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

        {!compact && !isConfirmed && !isWithdrawnOrRejected && (
          <div className="flex-1">
            <div className="text-sm text-gray-400 italic dark:text-gray-500">
              <span className="hidden sm:inline">
                Talk description will be available once the speaker confirms
                their participation.
              </span>
              <span className="sm:hidden">
                Description pending speaker confirmation.
              </span>
            </div>
          </div>
        )}

        {!compact && isWithdrawnOrRejected && (
          <div className="flex-1">
            <div className="text-sm text-red-400 italic dark:text-red-300">
              <span className="hidden sm:inline">
                This session has been cancelled and will not be part of the
                program.
              </span>
              <span className="sm:hidden">Session cancelled.</span>
            </div>
          </div>
        )}

        <div className={clsx(compact ? 'space-y-2' : 'space-y-3')}>
          <div
            className={clsx(
              'flex flex-wrap items-center gap-2 text-gray-600 dark:text-gray-400',
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
                <span>{formatConferenceDateShort(talk.scheduleDate)}</span>
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
                'rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700 dark:bg-gray-600 dark:text-gray-300',
                compact ? 'text-xs' : 'text-xs',
              )}
            >
              <span className="hidden sm:inline">{durationMinutes} min</span>
              <span className="sm:hidden">{durationMinutes}m</span>
            </span>
          </div>

          {!compact && isConfirmed && (
            <div className="flex flex-wrap gap-2">
              {talkData.format && (
                <FormatBadge format={talkData.format} variant="compact" />
              )}

              {talkData.level && (
                <div className="flex items-center gap-1">
                  <LevelIndicator level={talkData.level} size="sm" />
                  <LevelBadge level={talkData.level} variant="compact" />
                </div>
              )}

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

          {!compact && !isConfirmed && !isWithdrawnOrRejected && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-gray-600 dark:text-gray-300">
                Details pending
              </span>
            </div>
          )}

          {!compact && isWithdrawnOrRejected && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-600 dark:bg-red-900/50 dark:text-red-300">
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
