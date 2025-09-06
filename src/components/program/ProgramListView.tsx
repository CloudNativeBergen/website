import React from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { TalkCard } from './TalkCard'
import { FilteredProgramData } from '@/hooks/useProgramFilter'

interface ProgramListViewProps {
  data: FilteredProgramData
}

export const ProgramListView = React.memo(function ProgramListView({
  data,
}: ProgramListViewProps) {
  // Merge identical placeholder talks across tracks (like lunch breaks)
  const mergedTalks = data.allTalks.reduce(
    (acc, talk) => {
      // For placeholder talks, merge identical ones by time and placeholder text
      if (!talk.talk && talk.placeholder) {
        const existing = acc.find(
          (t) =>
            !t.talk &&
            t.placeholder === talk.placeholder &&
            t.scheduleDate === talk.scheduleDate &&
            t.startTime === talk.startTime &&
            t.endTime === talk.endTime,
        )

        if (!existing) {
          // Create a merged placeholder talk with multiple tracks
          acc.push({
            ...talk,
            trackTitle:
              data.availableFilters.tracks.length > 1
                ? 'All Tracks'
                : talk.trackTitle,
          })
        }
      } else {
        // Regular talks are not merged
        acc.push(talk)
      }
      return acc
    },
    [] as typeof data.allTalks,
  )

  if (mergedTalks.length === 0) {
    return (
      <div className="py-16 text-center">
        <MagnifyingGlassIcon className="mx-auto mb-4 h-16 w-16 text-gray-400 dark:text-gray-500" />
        <h3 className="font-space-grotesk mb-2 text-lg font-medium text-brand-slate-gray dark:text-gray-200">
          No talks found
        </h3>
        <p className="font-inter text-gray-600 dark:text-gray-400">
          Try adjusting your filters to see more content.
        </p>
      </div>
    )
  }

  // Group talks by day and sort them
  const talksByDay = mergedTalks.reduce(
    (acc, talk) => {
      if (!acc[talk.scheduleDate]) {
        acc[talk.scheduleDate] = []
      }
      acc[talk.scheduleDate].push(talk)
      return acc
    },
    {} as Record<string, typeof mergedTalks>,
  )

  // Sort talks within each day by start time
  Object.keys(talksByDay).forEach((date) => {
    talksByDay[date].sort((a, b) => a.startTime.localeCompare(b.startTime))
  })

  const sortedDays = Object.keys(talksByDay).sort()

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="space-y-8">
      {sortedDays.map((date) => (
        <div key={date} className="space-y-4">
          {/* Day Header - only show if multiple days */}
          {sortedDays.length > 1 && (
            <div className="border-b border-brand-frosted-steel pb-4 dark:border-gray-700">
              <h2 className="font-space-grotesk text-xl font-semibold text-brand-slate-gray dark:text-white">
                {formatDate(date)}
              </h2>
              <p className="font-inter mt-1 text-sm text-gray-600 dark:text-gray-400">
                {talksByDay[date].length} items scheduled
              </p>
            </div>
          )}

          {/* Talks List */}
          <div className="space-y-4">
            {talksByDay[date].map((talk, index) => (
              <TalkCard
                key={`${talk.scheduleDate}-${talk.trackTitle}-${talk.startTime}-${index}`}
                talk={talk}
                showDate={false} // Date is shown in header
                showTrack={data.availableFilters.tracks.length > 1}
                compact={true}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Summary */}
      <div className="border-t border-brand-frosted-steel py-8 text-center dark:border-gray-700">
        <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
          Showing {mergedTalks.length} items from {data.schedules.length} day
          {data.schedules.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
})
