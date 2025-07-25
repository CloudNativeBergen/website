import React from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { TalkCard } from './TalkCard'
import { FilteredProgramData } from '@/hooks/useProgramFilter'

interface ProgramGridViewProps {
  data: FilteredProgramData
}

export const ProgramGridView = React.memo(function ProgramGridView({
  data,
}: ProgramGridViewProps) {
  // Filter out placeholder sessions for grid view
  const talksOnly = data.allTalks.filter(
    (talk) => talk.talk !== null && talk.talk !== undefined,
  )

  if (talksOnly.length === 0) {
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
      {/* Grid of talk cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {talksOnly.map((talk, index) => (
          <TalkCard
            key={`${talk.scheduleDate}-${talk.trackTitle}-${talk.startTime}-${index}`}
            talk={talk}
            showDate={data.availableFilters.days.length > 1}
            showTrack={data.availableFilters.tracks.length > 1}
          />
        ))}
      </div>

      {/* Summary */}
      <div className="border-t border-brand-frosted-steel py-8 text-center">
        <p className="font-inter text-sm text-gray-600">
          Showing {talksOnly.length} talks from {data.schedules.length} day
          {data.schedules.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
})
