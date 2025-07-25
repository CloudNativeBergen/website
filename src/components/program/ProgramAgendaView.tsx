import React, { useState } from 'react'
import {
  BookmarkSlashIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { FilteredProgramData } from '@/hooks/useProgramFilter'
import { useBookmarks } from '@/hooks/useBookmarks'
import { TalkCard } from './TalkCard'

interface ProgramAgendaViewProps {
  data: FilteredProgramData
}

export const ProgramAgendaView = React.memo(function ProgramAgendaView({
  data,
}: ProgramAgendaViewProps) {
  const { bookmarks, isBookmarked, isLoaded } = useBookmarks()
  const [showOnlyBookmarked, setShowOnlyBookmarked] = useState(true)

  // Filter out placeholder sessions and then filter by bookmark status
  const talksOnly = data.allTalks.filter(
    (talk) => talk.talk !== null && talk.talk !== undefined,
  )

  const filteredTalks =
    showOnlyBookmarked && isLoaded
      ? talksOnly.filter((talk) => {
          const talkId =
            talk.talk!._id ||
            `${talk.scheduleDate}-${talk.trackTitle}-${talk.startTime}`
          return isBookmarked(talkId)
        })
      : showOnlyBookmarked && !isLoaded
        ? [] // Show empty while loading when in bookmarked-only mode
        : talksOnly

  // Group talks by day and sort them
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

  if (showOnlyBookmarked && isLoaded && bookmarks.length === 0) {
    return (
      <div className="py-16 text-center">
        <BookmarkSlashIcon className="mx-auto mb-4 h-16 w-16 text-gray-400" />
        <h3 className="font-space-grotesk mb-2 text-lg font-medium text-brand-slate-gray">
          No talks in your agenda yet
        </h3>
        <p className="font-inter mb-6 text-gray-600">
          Start building your personal conference agenda by bookmarking talks
          you want to attend.
        </p>
        <button
          onClick={() => setShowOnlyBookmarked(false)}
          className="rounded-lg bg-brand-cloud-blue px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700"
        >
          Browse All Talks
        </button>
      </div>
    )
  }

  if (filteredTalks.length === 0) {
    return (
      <div className="py-16 text-center">
        <MagnifyingGlassIcon className="mx-auto mb-4 h-16 w-16 text-gray-400" />
        <h3 className="font-space-grotesk mb-2 text-lg font-medium text-brand-slate-gray">
          No talks found
        </h3>
        <p className="font-inter text-gray-600">
          Try adjusting your filters to see more content.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Agenda Controls */}
      <div className="rounded-lg border border-brand-frosted-steel bg-brand-glacier-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
              Your Personal Agenda
            </h3>
            <p className="font-inter mt-1 text-sm text-gray-600">
              {bookmarks.length} talk{bookmarks.length !== 1 ? 's' : ''}{' '}
              bookmarked
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={showOnlyBookmarked}
                onChange={(e) => setShowOnlyBookmarked(e.target.checked)}
                className="rounded border-brand-frosted-steel text-brand-cloud-blue focus:ring-brand-cloud-blue"
              />
              <span className="font-inter text-sm text-brand-slate-gray">
                Show only bookmarked
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Talks */}
      {sortedDays.map((date) => (
        <div key={date} className="space-y-4">
          {/* Day Header - only show if multiple days */}
          {sortedDays.length > 1 && (
            <div className="border-b border-brand-frosted-steel pb-4">
              <h2 className="font-space-grotesk text-xl font-semibold text-brand-slate-gray">
                {formatDate(date)}
              </h2>
              <p className="font-inter mt-1 text-sm text-gray-600">
                {talksByDay[date].length} talks
                {showOnlyBookmarked && ' in your agenda'}
              </p>
            </div>
          )}

          {/* Talks List */}
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

      {/* Summary */}
      <div className="border-t border-brand-frosted-steel py-8 text-center">
        <p className="font-inter text-sm text-gray-600">
          {showOnlyBookmarked ? 'Your agenda: ' : 'Showing '}
          {filteredTalks.length} talk{filteredTalks.length !== 1 ? 's' : ''}
          {!showOnlyBookmarked &&
            ` from ${data.schedules.length} day${data.schedules.length !== 1 ? 's' : ''}`}
        </p>
      </div>
    </div>
  )
})
