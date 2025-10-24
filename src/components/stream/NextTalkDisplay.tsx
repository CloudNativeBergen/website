'use client'

import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { ClockIcon, CalendarIcon } from '@heroicons/react/24/outline'
import type { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import {
  getCurrentConferenceTime,
  getTalkStatus,
  parseTalkDateTime,
  findCurrentTalkPosition,
  isScheduleToday,
  type TalkStatus,
} from '@/lib/program/time-utils'
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
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full bg-green-500 text-white px-4 py-1.5">
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

  const findNextTalkForRoom = (): CurrentTalkData | null => {
    const currentTime = getCurrentConferenceTime()

    // First sort schedules to prioritize today's schedule
    const sortedSchedules = [...(schedules || [])].sort((a, b) => {
      const aIsToday = isScheduleToday(a.date, currentTime)
      const bIsToday = isScheduleToday(b.date, currentTime)
      if (aIsToday && !bIsToday) return -1
      if (!aIsToday && bIsToday) return 1
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    })

    // Try to use findCurrentTalkPosition for today's schedule
    const currentPosition = findCurrentTalkPosition(sortedSchedules, currentTime)

    if (currentPosition) {
      const schedule = sortedSchedules[currentPosition.scheduleIndex]
      const track = schedule.tracks[currentPosition.trackIndex]

      // If the current position is in our room, use it
      if (track.trackTitle === roomTrackTitle) {
        const status = getTalkStatus(currentPosition.talk, currentPosition.scheduleDate, currentTime)
        return {
          talk: currentPosition.talk,
          scheduleDate: currentPosition.scheduleDate,
          status
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
        (track) => track.trackTitle === roomTrackTitle
      )

      if (!matchingTrack || !matchingTrack.talks) continue

      // Sort talks by start time within the track
      const sortedTalks = [...matchingTrack.talks].sort((a, b) => {
        if (!a.startTime || !b.startTime) return 0
        return a.startTime.localeCompare(b.startTime)
      })

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
  }

  useEffect(() => {
    const updateCurrentTalk = () => {
      const nextTalk = findNextTalkForRoom()
      setCurrentTalk(nextTalk)
    }

    updateCurrentTalk()
    const interval = setInterval(updateCurrentTalk, 30000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, roomTrackTitle])

  if (!currentTalk) {
    const hasScheduledTalks = schedules?.some((schedule) =>
      schedule.tracks?.some(
        (track) => track.trackTitle === roomTrackTitle && track.talks?.length
      )
    )

    if (!hasScheduledTalks) {
      return (
        <div
          className={clsx(
            'bg-white/95 dark:bg-gray-800/95 border-2 border-gray-300 rounded-lg shadow-xl p-8',
            'flex flex-col items-center justify-center text-center',
            className
          )}
          role="status"
          aria-live="polite"
        >
          <CalendarIcon className="w-16 h-16 text-gray-400 mb-4" />
          <p className="text-gray-600 dark:text-gray-400 text-xl">
            No talks scheduled for this room
          </p>
        </div>
      )
    }

    return (
      <div
        className={clsx(
          'bg-white/95 dark:bg-gray-800/95 border-2 border-gray-300 rounded-lg shadow-xl p-8',
          'flex flex-col items-center justify-center text-center',
          className
        )}
        role="status"
        aria-live="polite"
      >
        <CalendarIcon className="w-16 h-16 text-brand-cloud-blue mb-4" />
        <p className="text-brand-slate-gray dark:text-gray-200 text-xl font-medium">
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
  const isToday = startDate.toDateString() === new Date().toDateString()

  const extractDescription = () => {
    if (!talk.talk?.description) return null
    const firstBlock = talk.talk.description.find(
      (block: { _type?: string }) => block._type === 'block'
    )
    if (!firstBlock?.children || !Array.isArray(firstBlock.children)) return null
    return firstBlock.children
      .filter((child: { _type?: string }) => child._type === 'span')
      .map((child: { text?: string }) => child.text)
      .join(' ')
  }

  const description = extractDescription()

  if (!talk.talk) {
    return (
      <div
        className={clsx(
          'bg-white/95 dark:bg-gray-800/95 border-2 rounded-lg shadow-xl p-8 opacity-75',
          borderColor,
          className
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-between mb-4">
          <StatusBadge status={status} />
        </div>
        <h2 className="text-brand-slate-gray dark:text-gray-200 font-space-grotesk text-2xl font-medium mb-4">
          {talk.placeholder || 'Service Session'}
        </h2>
        <div className="flex items-center text-gray-600 dark:text-gray-400 text-lg">
          <ClockIcon className="w-5 h-5 mr-2" />
          <span className="font-mono">
            {talk.startTime} - {talk.endTime}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'bg-white/95 dark:bg-gray-800/95 border-2 rounded-lg shadow-xl p-8',
        borderColor,
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between mb-6">
        <StatusBadge status={status} />
        {!isToday && (
          <div className="flex items-center text-gray-600 dark:text-gray-400">
            <CalendarIcon className="w-5 h-5 mr-2" />
            <span>{startDate.toLocaleDateString()}</span>
          </div>
        )}
      </div>

      <h2 className="font-space-grotesk text-3xl font-bold text-brand-slate-gray dark:text-white mb-6">
        {talk.talk.title}
      </h2>

      {talk.talk.speakers && talk.talk.speakers.length > 0 && (
        <div className="flex items-center gap-4 mb-6">
          <SpeakerAvatars speakers={talk.talk.speakers} size="lg" maxVisible={3} />
          <div className="text-brand-cloud-blue text-xl font-medium">
            <ClickableSpeakerNames
              speakers={talk.talk.speakers}
              showFirstNameOnly={false}
            />
          </div>
        </div>
      )}

      <div className="flex items-center text-gray-600 dark:text-gray-400 text-lg mb-4">
        <ClockIcon className="w-5 h-5 mr-2" />
        <span className="font-mono">
          {talk.startTime} - {talk.endTime}
        </span>
      </div>

      {description && (
        <p className="text-gray-600 dark:text-gray-300 text-base line-clamp-3">
          {description}
        </p>
      )}
    </div>
  )
}