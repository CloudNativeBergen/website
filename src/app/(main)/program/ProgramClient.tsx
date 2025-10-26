'use client'

import React from 'react'
import { ConferenceSchedule } from '@/lib/conference/types'
import { Topic } from '@/lib/topic/types'
import { useProgramFilter } from '@/hooks/useProgramFilter'
import { useProgramViewMode } from '@/hooks/useProgramViewMode'
import { useLiveProgram } from '@/hooks/useLiveProgram'
import { ProgramFilters } from '@/components/program/ProgramFilters'
import { ProgramScheduleView } from '@/components/program/ProgramScheduleView'
import { ProgramGridView } from '@/components/program/ProgramGridView'
import { ProgramListView } from '@/components/program/ProgramListView'
import { ProgramAgendaView } from '@/components/program/ProgramAgendaView'

interface ProgramClientProps {
  schedules: ConferenceSchedule[]
  conferenceTopics: Topic[]
  conferenceStartDate: string
  conferenceEndDate: string
}

export function ProgramClient({
  schedules,
  conferenceStartDate,
  conferenceEndDate,
}: ProgramClientProps) {
  const {
    filters,
    filteredData,
    updateFilter,
    clearFilters,
    hasActiveFilters,
  } = useProgramFilter(schedules)

  const { viewMode, setViewMode, viewModes, currentViewConfig } =
    useProgramViewMode()

  const { isLive, currentPosition, talkStatusMap } = useLiveProgram(
    schedules,
    conferenceStartDate,
    conferenceEndDate,
  )

  const renderProgramView = () => {
    switch (viewMode) {
      case 'grid':
        return (
          <ProgramGridView data={filteredData} talkStatusMap={talkStatusMap} />
        )
      case 'list':
        return (
          <ProgramListView data={filteredData} talkStatusMap={talkStatusMap} />
        )
      case 'agenda':
        return (
          <ProgramAgendaView
            data={filteredData}
            talkStatusMap={talkStatusMap}
          />
        )
      case 'schedule':
      default:
        return (
          <ProgramScheduleView
            data={filteredData}
            talkStatusMap={talkStatusMap}
            currentPosition={currentPosition}
            isLive={isLive}
          />
        )
    }
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <ProgramFilters
          filters={filters}
          availableFilters={filteredData.availableFilters}
          onFilterChange={updateFilter}
          onClearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
          totalTalks={schedules.reduce(
            (sum, schedule) =>
              sum +
              schedule.tracks.reduce(
                (trackSum, track) =>
                  trackSum +
                  track.talks.filter(
                    (talk) => talk.talk !== null && talk.talk !== undefined,
                  ).length,
                0,
              ),
            0,
          )}
          filteredTalks={
            filteredData.allTalks.filter(
              (talk) => talk.talk !== null && talk.talk !== undefined,
            ).length
          }
          viewMode={viewMode}
          viewModes={viewModes}
          onViewModeChange={setViewMode}
          currentViewConfig={currentViewConfig}
        />
      </div>

      <div className="min-h-[400px]">
        <div className="print:hidden">{renderProgramView()}</div>
        <div className="hidden print:block">
          <ProgramListView data={filteredData} talkStatusMap={talkStatusMap} />
        </div>
      </div>
    </div>
  )
}
