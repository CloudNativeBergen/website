'use client'
/**
 * PROTOTYPE — Variant C, "Focus". Neither a board nor a queue: a narrow
 * calendar spine of the weeks that actually contain work, campaigns as
 * coloured rails beside it. The quiet months are omitted rather than drawn,
 * which is the other answer to "85% of the width is empty".
 */
import { useMemo, useState } from 'react'
import type { PlanView, TaskView } from '@/lib/marketing/types'
import {
  MILESTONE_LABELS,
  toMs,
} from '@/components/admin/marketing/timeline-model'
import type { Milestone } from '@/lib/marketing/milestones'
import { NO_FILTERS, filterTasks, type Filters } from './model'
import { CARD, Chip, FilterBar } from './shared'

export const NAME = 'Focus weeks'
const WEEK = 7 * 86_400_000

function weekStart(ms: number) {
  const d = new Date(ms)
  const day = (d.getUTCDay() + 6) % 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)
}

export function VariantC({ view }: { view: PlanView }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const shown = useMemo(
    () => filterTasks(view.tasks, filters, view.today),
    [view.tasks, filters, view.today],
  )
  const campaignById = new Map(view.campaigns.map((c) => [c._id, c]))
  const todayWeek = weekStart(toMs(view.today))

  // Only weeks that CONTAIN something exist. Gaps collapse to a marker.
  const byWeek = new Map<number, TaskView[]>()
  for (const t of shown) {
    const ms = toMs(t.date)
    if (!Number.isFinite(ms)) continue
    const w = weekStart(ms)
    byWeek.set(w, [...(byWeek.get(w) ?? []), t])
  }
  const milestonesByWeek = new Map<number, Milestone[]>()
  for (const m of Object.keys(view.milestones) as Milestone[]) {
    const ms = toMs(view.milestones[m]?.date)
    if (!Number.isFinite(ms)) continue
    const w = weekStart(ms)
    milestonesByWeek.set(w, [...(milestonesByWeek.get(w) ?? []), m])
  }
  const weeks = [
    ...new Set([...byWeek.keys(), ...milestonesByWeek.keys()]),
  ].sort((a, b) => a - b)

  return (
    <div>
      <FilterBar
        view={view}
        filters={filters}
        onChange={setFilters}
        showing={shown.length}
        total={view.tasks.length}
      />
      <div className={`overflow-hidden ${CARD}`}>
        {weeks.map((w, i) => {
          const gap = i > 0 ? Math.round((w - weeks[i - 1]) / WEEK) - 1 : 0
          const tasks = byWeek.get(w) ?? []
          const ms = milestonesByWeek.get(w) ?? []
          const isNow = w === todayWeek
          return (
            <div key={w}>
              {gap > 0 && (
                <div className="flex items-center gap-2 bg-gray-50 px-3 py-1 text-[11px] text-gray-400 dark:bg-gray-800/50 dark:text-gray-500">
                  <div className="h-px grow bg-gray-200 dark:bg-gray-700" />
                  {gap} quiet {gap === 1 ? 'week' : 'weeks'}
                  <div className="h-px grow bg-gray-200 dark:bg-gray-700" />
                </div>
              )}
              <div
                className={`flex gap-3 border-b border-gray-100 px-3 py-2 ${
                  isNow ? 'bg-red-50/60 dark:bg-red-900/20' : ''
                }`}
              >
                <div className="w-24 shrink-0">
                  <div
                    className={`font-space-grotesk text-xs font-semibold ${isNow ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-white'}`}
                  >
                    {new Date(w).toLocaleDateString('nb-NO', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </div>
                  {isNow && (
                    <div className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                      this week
                    </div>
                  )}
                  {ms.map((m) => (
                    <div
                      key={m}
                      className="text-[10px] leading-tight text-amber-700 dark:text-amber-300"
                    >
                      ⚑ {MILESTONE_LABELS[m]}
                    </div>
                  ))}
                </div>
                <div className="flex grow flex-wrap items-start gap-1">
                  {tasks.length === 0 ? (
                    <span className="text-[11px] text-gray-300 dark:text-gray-600">
                      —
                    </span>
                  ) : (
                    tasks.map((t) => (
                      <span key={t._id} className="flex items-center gap-1">
                        <Chip task={t} view={view} label />
                      </span>
                    ))
                  )}
                </div>
                <div className="w-40 shrink-0 text-right text-[10px] text-gray-400 dark:text-gray-500">
                  {[
                    ...new Set(
                      tasks.map((t) => campaignById.get(t.campaignId)?.title),
                    ),
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Only weeks containing work are drawn; quiet stretches collapse to a
        rule. Chips carry their titles, so nothing needs opening to be
        identified.
      </p>
    </div>
  )
}
