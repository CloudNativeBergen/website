import React from 'react'
import {
  BookmarkSlashIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { FilteredProgramData } from '@/hooks/useProgramFilter'
import { useBookmarks } from '@/contexts/BookmarksContext'
import { TalkCard } from './TalkCard'

interface ProgramAgendaViewProps {
  data: FilteredProgramData
}

export const ProgramAgendaView = React.memo(function ProgramAgendaView({
  data,
}: ProgramAgendaViewProps) {
  const { bookmarks, isBookmarked, isLoaded } = useBookmarks()

  const talksOnly = data.allTalks.filter(
    (talk) => talk.talk !== null && talk.talk !== undefined,
  )

  const filteredTalks = isLoaded
    ? talksOnly.filter((talk) => {
        const talkId =
          talk.talk!._id ||
          `${talk.scheduleDate}-${talk.trackTitle}-${talk.startTime}`
        return isBookmarked(talkId)
      })
    : []

  const talksByDay = filteredTalks.reduce(
    (acc, talk) => {
      if (!acc[talk.scheduleDate]) {
        acc[talk.scheduleDate] = []
      }
      acc[talk.scheduleDate].push(talk)
      return acc
    },
    {} as Record<string, typeof filteredTalks>,
  )

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

  if (isLoaded && bookmarks.length === 0) {
    return (
      <div className="py-16 text-center">
        <BookmarkSlashIcon className="mx-auto mb-4 h-16 w-16 text-gray-400 dark:text-gray-500" />
        <h3 className="font-space-grotesk mb-2 text-lg font-medium text-brand-slate-gray dark:text-gray-200">
          No talks in your agenda yet
        </h3>
        <p className="font-inter text-gray-600 dark:text-gray-400">
          Start building your personal conference agenda by bookmarking talks
          you want to attend.
        </p>
      </div>
    )
  }

  if (filteredTalks.length === 0) {
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

  return (
    <div className="space-y-8">
      {sortedDays.map((date) => (
        <div key={date} className="space-y-4">
          {sortedDays.length > 1 && (
            <div className="border-b border-brand-frosted-steel pb-4 dark:border-gray-700">
              <h2 className="font-space-grotesk text-xl font-semibold text-brand-slate-gray dark:text-white">
                {formatDate(date)}
              </h2>
              <p className="font-inter mt-1 text-sm text-gray-600 dark:text-gray-400">
                {talksByDay[date].length} talks in your agenda
              </p>
            </div>
          )}

          <div className="space-y-4">
            {talksByDay[date].map((talk, index) => (
              <TalkCard
                key={`${talk.scheduleDate}-${talk.trackTitle}-${talk.startTime}-${index}`}
                talk={talk}
                showDate={false}
                showTrack={data.availableFilters.tracks.length > 1}
                compact={true}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="border-t border-brand-frosted-steel py-8 text-center dark:border-gray-700">
        <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
          Your agenda: {filteredTalks.length} talk
          {filteredTalks.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
})
