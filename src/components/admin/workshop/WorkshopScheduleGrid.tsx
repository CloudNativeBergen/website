'use client'

import type { ReactNode } from 'react'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { groupWorkshopsBySchedule } from './utils'

interface WorkshopScheduleGridProps {
  workshops: ProposalWithWorkshopData[]
  renderCard: (workshop: ProposalWithWorkshopData) => ReactNode
}

/**
 * The admin workshops laid out like the program: tracks (rooms) as columns,
 * start times as rows. Seeing who sits where side by side is what an
 * organizer needs when two rooms swap.
 */
export function WorkshopScheduleGrid({
  workshops,
  renderCard,
}: WorkshopScheduleGridProps) {
  const { days, unscheduled } = groupWorkshopsBySchedule(workshops)

  return (
    <div className="space-y-8">
      {days.map((day) => (
        <section key={day.date} aria-label={`Workshops on ${day.date}`}>
          {days.length > 1 && (
            <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
              {day.date}
            </h2>
          )}
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[48rem] gap-4"
              style={{
                gridTemplateColumns: `5rem repeat(${day.tracks.length}, minmax(16rem, 1fr))`,
              }}
            >
              <div />
              {day.tracks.map((track) => (
                <div
                  key={track}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {track}
                </div>
              ))}
              {day.slots.map((slot) => [
                <div
                  key={`${slot.startTime}-time`}
                  className="pt-3 font-mono text-sm text-gray-700 dark:text-gray-300"
                >
                  {slot.startTime}
                  {slot.endTime && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      – {slot.endTime}
                    </div>
                  )}
                </div>,
                ...slot.cells.map((cell, i) =>
                  cell.length > 0 ? (
                    <div
                      key={`${slot.startTime}-${day.tracks[i]}`}
                      className="space-y-4"
                    >
                      {cell.map((workshop) => (
                        <div key={workshop._id}>{renderCard(workshop)}</div>
                      ))}
                    </div>
                  ) : (
                    <div
                      key={`${slot.startTime}-${day.tracks[i]}`}
                      className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700"
                    />
                  ),
                ),
              ])}
            </div>
          </div>
        </section>
      ))}

      {unscheduled.length > 0 && (
        <section aria-label="Unscheduled workshops">
          {days.length > 0 && (
            <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
              Not in the schedule
            </h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {unscheduled.map((workshop) => (
              <div key={workshop._id}>{renderCard(workshop)}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
