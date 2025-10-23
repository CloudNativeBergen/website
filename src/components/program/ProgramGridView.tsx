import React from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { TalkCard } from './TalkCard'
import { FilteredProgramData } from '@/hooks/useProgramFilter'
import { getTalkStatusKey } from '@/lib/program/time-utils'
import type { TalkStatus } from '@/lib/program/time-utils'

interface ProgramGridViewProps {
  data: FilteredProgramData
  talkStatusMap?: Map<string, TalkStatus>
}

export const ProgramGridView = React.memo(function ProgramGridView({
  data,
  talkStatusMap,
}: ProgramGridViewProps) {
  const talksOnly = data.allTalks.filter(
    (talk) => talk.talk !== null && talk.talk !== undefined,
  )

  if (talksOnly.length === 0) {
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {talksOnly.map((talk, index) => {
          const status = talkStatusMap?.get(
            getTalkStatusKey(
              talk.scheduleDate,
              talk.startTime,
              talk.trackIndex,
              talk.talk?._id,
            ),
          )
          return (
            <TalkCard
              key={`${talk.scheduleDate}-${talk.trackTitle}-${talk.startTime}-${index}`}
              talk={talk}
              status={status}
              showDate={data.availableFilters.days.length > 1}
              showTrack={data.availableFilters.tracks.length > 1}
            />
          )
        })}
      </div>

      <div className="border-t border-brand-frosted-steel py-8 text-center dark:border-gray-700">
        <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
          Showing {talksOnly.length} talks from {data.schedules.length} day
          {data.schedules.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
})
