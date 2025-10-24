'use client'

import { useState, useEffect, useCallback } from 'react'
import clsx from 'clsx'
import { ClockIcon, CalendarIcon } from '@heroicons/react/24/outline'
import type { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import {
  getCurrentConferenceTime,
  getTalkStatus,
  parseTalkDateTime,
  findCurrentTalkPosition,
  type TalkStatus,
} from '@/lib/program/time-utils'
import { onSimulatedTimeChange } from '@/lib/program/dev-time'
import {
  sortSchedulesByDate,
  sortTalksByStartTime,
} from '@/lib/stream/schedule-utils'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import { ClickableSpeakerNames } from '@/components/ClickableSpeakerNames'

interface NextTalkDisplayProps {
  schedules: ConferenceSchedule[]
  roomTrackTitle: string
  className?: string
}

interface CurrentTalkData {
  talk: TrackTalk
  scheduleDate: string
  status: TalkStatus
}

function StatusBadge({ status }: { status: TalkStatus }) {
  if (status === 'happening-now') {
    return (
      <span className="inline-flex items-center px-3 py-1.5 text-sm font-semibold">
        <span className="relative flex items-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60 [animation-duration:2s]"></span>
          <span className="relative inline-flex rounded-full bg-green-500 px-4 py-1.5 text-white shadow-lg shadow-green-500/50">
            LIVE NOW
          </span>
        </span>
      </span>
    )
  }

  if (status === 'happening-soon') {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-500 px-4 py-1.5 text-sm font-semibold text-white">
        STARTING SOON
      </span>
    )
  }

  if (status === 'upcoming') {
    return (
      <span className="inline-flex items-center rounded-full bg-brand-cloud-blue px-4 py-1.5 text-sm font-semibold text-white">
        UP NEXT
      </span>
    )
  }

  return null
}

export default function NextTalkDisplay({
  schedules,
  roomTrackTitle,
  className,
}: NextTalkDisplayProps) {
  const [currentTalk, setCurrentTalk] = useState<CurrentTalkData | null>(null)
  const [currentSimulatedTime, setCurrentSimulatedTime] = useState<Date>(
    getCurrentConferenceTime(),
  )

  const findNextTalkForRoom = useCallback((): CurrentTalkData | null => {
    const currentTime = getCurrentConferenceTime()

    // Sort schedules to prioritize today's schedule
    const sortedSchedules = sortSchedulesByDate(schedules || [], currentTime)

    // Try to use findCurrentTalkPosition for today's schedule
    const currentPosition = findCurrentTalkPosition(
      sortedSchedules,
      currentTime,
    )

    if (currentPosition) {
      const schedule = sortedSchedules[currentPosition.scheduleIndex]
      const track = schedule.tracks[currentPosition.trackIndex]

      // If the current position is in our room, use it
      if (track.trackTitle === roomTrackTitle) {
        const status = getTalkStatus(
          currentPosition.talk,
          currentPosition.scheduleDate,
          currentTime,
        )
        return {
          talk: currentPosition.talk,
          scheduleDate: currentPosition.scheduleDate,
          status,
        }
      }
    }

    // Otherwise, search for the next talk specifically in our room
    let happeningNow: CurrentTalkData | null = null
    let happeningSoon: CurrentTalkData | null = null
    let firstUpcoming: CurrentTalkData | null = null

    for (const schedule of sortedSchedules) {
      if (!schedule.date || !schedule.tracks) continue

      const matchingTrack = schedule.tracks.find(
        (track) => track.trackTitle === roomTrackTitle,
      )

      if (!matchingTrack || !matchingTrack.talks) continue

      // Sort talks by start time within the track
      const sortedTalks = sortTalksByStartTime(matchingTrack.talks)

      for (const talk of sortedTalks) {
        if (!talk.startTime || !talk.endTime) continue

        const status = getTalkStatus(talk, schedule.date, currentTime)

        if (status === 'happening-now' && !happeningNow) {
          happeningNow = { talk, scheduleDate: schedule.date, status }
          return happeningNow // Return immediately if we find a live talk
        } else if (status === 'happening-soon' && !happeningSoon) {
          happeningSoon = { talk, scheduleDate: schedule.date, status }
        } else if (status === 'upcoming' && !firstUpcoming) {
          firstUpcoming = { talk, scheduleDate: schedule.date, status }
        }
      }
    }

    return happeningSoon || firstUpcoming
  }, [schedules, roomTrackTitle])

  const findNextSession = useCallback(
    (afterTime: string): CurrentTalkData | null => {
      const currentTime = getCurrentConferenceTime()
      const sortedSchedules = sortSchedulesByDate(schedules || [], currentTime)

      for (const schedule of sortedSchedules) {
        if (!schedule.date || !schedule.tracks) continue

        const matchingTrack = schedule.tracks.find(
          (track) => track.trackTitle === roomTrackTitle,
        )

        if (!matchingTrack || !matchingTrack.talks) continue

        const sortedTalks = sortTalksByStartTime(matchingTrack.talks)

        for (const talk of sortedTalks) {
          if (!talk.startTime || !talk.endTime) continue

          // Find any session (talk or service) that starts at or after the given time
          if (talk.startTime >= afterTime) {
            return {
              talk,
              scheduleDate: schedule.date,
              status: 'upcoming',
            }
          }
        }
      }

      return null
    },
    [schedules, roomTrackTitle],
  )

  useEffect(() => {
    const updateCurrentTalk = () => {
      const newTime = getCurrentConferenceTime()
      setCurrentSimulatedTime(newTime)
      const nextTalk = findNextTalkForRoom()
      setCurrentTalk(nextTalk)
    }

    updateCurrentTalk()
    const interval = setInterval(updateCurrentTalk, 30000)

    // Listen for simulated time changes (dev mode only)
    const unsubscribe = onSimulatedTimeChange(updateCurrentTalk)

    return () => {
      clearInterval(interval)
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, roomTrackTitle])

  if (!currentTalk) {
    const hasScheduledTalks = schedules?.some((schedule) =>
      schedule.tracks?.some(
        (track) => track.trackTitle === roomTrackTitle && track.talks?.length,
      ),
    )

    if (!hasScheduledTalks) {
      return (
        <div
          className={clsx(
            'rounded-lg border-2 border-gray-300 bg-white/95 p-8 shadow-xl dark:bg-gray-800/95',
            'flex flex-col items-center justify-center text-center',
            className,
          )}
          role="status"
          aria-live="polite"
        >
          <CalendarIcon className="mb-4 h-16 w-16 text-gray-400" />
          <p className="text-xl text-gray-600 dark:text-gray-400">
            No talks scheduled for this room
          </p>
        </div>
      )
    }

    return (
      <div
        className={clsx(
          'rounded-lg border-2 border-gray-300 bg-white/95 p-8 shadow-xl dark:bg-gray-800/95',
          'flex flex-col items-center justify-center text-center',
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <CalendarIcon className="mb-4 h-16 w-16 text-brand-cloud-blue" />
        <p className="text-xl font-medium text-brand-slate-gray dark:text-gray-200">
          All talks for today have concluded. Thank you for attending!
        </p>
      </div>
    )
  }

  const { talk, scheduleDate, status } = currentTalk
  const borderColor =
    status === 'happening-now'
      ? 'border-green-500'
      : status === 'happening-soon'
        ? 'border-yellow-500'
        : 'border-brand-cloud-blue'

  const startDate = parseTalkDateTime(scheduleDate, talk.startTime)
  const isToday =
    startDate.toDateString() === currentSimulatedTime.toDateString()

  const extractDescription = () => {
    if (!talk.talk?.description) return null
    const firstBlock = talk.talk.description.find(
      (block: { _type?: string }) => block._type === 'block',
    )
    if (!firstBlock?.children || !Array.isArray(firstBlock.children))
      return null
    return firstBlock.children
      .filter((child: { _type?: string }) => child._type === 'span')
      .map((child: { text?: string }) => child.text)
      .join(' ')
  }

  const description = extractDescription()

  if (!talk.talk) {
    // Find the next session (talk or service) after this service session
    const nextSession = findNextSession(talk.endTime)

    return (
      <div className="space-y-6">
        <div
          className={clsx(
            'rounded-lg border-2 bg-white/95 p-8 shadow-xl dark:bg-gray-800/95',
            borderColor,
            className,
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-space-grotesk text-4xl font-medium text-brand-slate-gray dark:text-gray-200">
              {talk.placeholder || 'Service Session'}
            </h2>
            <div className="flex flex-shrink-0 items-center text-2xl text-gray-600 dark:text-gray-400">
              <ClockIcon className="mr-3 h-7 w-7" />
              <span className="font-mono">
                {talk.startTime} - {talk.endTime}
              </span>
            </div>
          </div>
        </div>

        {nextSession && (
          <div
            className={clsx(
              'rounded-lg border-2 border-brand-cloud-blue bg-white/95 p-8 shadow-xl dark:bg-gray-800/95',
              className,
            )}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <span className="inline-flex items-center rounded-full bg-brand-cloud-blue px-5 py-2 text-base font-semibold text-white">
                UP NEXT
              </span>
              <div className="flex flex-shrink-0 items-center text-2xl text-gray-600 dark:text-gray-400">
                <ClockIcon className="mr-3 h-7 w-7" />
                <span className="font-mono">
                  {nextSession.talk.startTime} - {nextSession.talk.endTime}
                </span>
              </div>
            </div>

            <h3 className="font-space-grotesk mb-4 text-4xl font-bold text-brand-slate-gray dark:text-white">
              {nextSession.talk.talk?.title ||
                nextSession.talk.placeholder ||
                'Next Session'}
            </h3>

            {nextSession.talk.talk?.speakers &&
              nextSession.talk.talk.speakers.length > 0 && (
                <div className="flex items-center gap-4">
                  <SpeakerAvatars
                    speakers={nextSession.talk.talk.speakers}
                    size="lg"
                    maxVisible={3}
                  />
                  <div className="text-xl font-medium text-brand-cloud-blue">
                    <ClickableSpeakerNames
                      speakers={nextSession.talk.talk.speakers}
                      showFirstNameOnly={false}
                    />
                  </div>
                </div>
              )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'rounded-lg border-2 bg-white/95 p-8 shadow-xl dark:bg-gray-800/95',
        borderColor,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="mb-6 flex items-center justify-between">
        <StatusBadge status={status} />
        {!isToday && (
          <div className="flex items-center text-gray-600 dark:text-gray-400">
            <CalendarIcon className="mr-2 h-5 w-5" />
            <span>{startDate.toLocaleDateString()}</span>
          </div>
        )}
      </div>

      <h2 className="font-space-grotesk mb-6 text-3xl font-bold text-brand-slate-gray dark:text-white">
        {talk.talk.title}
      </h2>

      {talk.talk.speakers && talk.talk.speakers.length > 0 && (
        <div className="mb-6 flex items-center gap-4">
          <SpeakerAvatars
            speakers={talk.talk.speakers}
            size="lg"
            maxVisible={3}
          />
          <div className="text-xl font-medium text-brand-cloud-blue">
            <ClickableSpeakerNames
              speakers={talk.talk.speakers}
              showFirstNameOnly={false}
            />
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center text-lg text-gray-600 dark:text-gray-400">
        <ClockIcon className="mr-2 h-5 w-5" />
        <span className="font-mono">
          {talk.startTime} - {talk.endTime}
        </span>
      </div>

      {description && (
        <p className="line-clamp-3 text-base text-gray-600 dark:text-gray-300">
          {description}
        </p>
      )}
    </div>
  )
}
