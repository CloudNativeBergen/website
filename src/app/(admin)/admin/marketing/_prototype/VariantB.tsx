'use client'
/**
 * PROTOTYPE — Variant B, "Work list". Inverts the hierarchy: the list is the
 * page (#1085) and the timeline shrinks to a one-line density ribbon used as
 * a minimap. Answers "what do I do today?" rather than "what shape is the
 * edition?".
 */
import { useMemo, useState } from 'react'
import type { PlanView, TaskView } from '@/lib/marketing/types'
import {
  STATUS_LABELS,
  pct,
  timelineRange,
  toMs,
} from '@/components/admin/marketing/timeline-model'
import {
  NO_FILTERS,
  clusterByX,
  dayLabel,
  filterTasks,
  workOrder,
  type Filters,
} from './model'
import { CARD, HEADING, Chip, FilterBar } from './shared'

export const NAME = 'Work list'
const BOARD = 1100

export function VariantB({ view }: { view: PlanView }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const range = useMemo(() => timelineRange(view), [view])
  const shown = useMemo(
    () => workOrder(filterTasks(view.tasks, filters, view.today), view.today),
    [view.tasks, filters, view.today],
  )
  const campaignById = new Map(view.campaigns.map((c) => [c._id, c]))
  const now = toMs(view.today)

  // Grouped by urgency rather than by campaign — the list is a queue.
  const groups: { label: string; tasks: TaskView[] }[] = [
    {
      label: 'Overdue',
      tasks: shown.filter(
        (t) => !t.complete && t.status !== 'skipped' && toMs(t.date) < now,
      ),
    },
    {
      label: 'Next 14 days',
      tasks: shown.filter(
        (t) =>
          !t.complete &&
          t.status !== 'skipped' &&
          toMs(t.date) >= now &&
          toMs(t.date) < now + 14 * 86_400_000,
      ),
    },
    {
      label: 'Later',
      tasks: shown.filter(
        (t) =>
          !t.complete &&
          t.status !== 'skipped' &&
          toMs(t.date) >= now + 14 * 86_400_000,
      ),
    },
    {
      label: 'Done & skipped',
      tasks: shown.filter((t) => t.complete || t.status === 'skipped'),
    },
  ]

  return (
    <div>
      <FilterBar
        view={view}
        filters={filters}
        onChange={setFilters}
        showing={shown.length}
        total={view.tasks.length}
      />

      {/* Timeline demoted to a density ribbon — orientation only, one row per campaign */}
      <div className={`mb-4 overflow-hidden p-3 ${CARD}`}>
        <div className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
          Edition at a glance
        </div>
        {view.campaigns.map((c) => {
          const tasks = shown.filter((t) => t.campaignId === c._id)
          const clusters = clusterByX(tasks, range, BOARD)
          return (
            <div key={c._id} className="flex items-center gap-2 py-0.5">
              <div className="w-44 shrink-0 truncate text-[11px] text-gray-600 dark:text-gray-300">
                {c.title}
              </div>
              <div className="relative h-4 grow rounded bg-gray-50 dark:bg-gray-800/60">
                {clusters.map((cl) => (
                  <div
                    key={cl.x}
                    title={`${cl.tasks.length} task(s)`}
                    className="absolute top-1 h-2 -translate-x-1/2 rounded-full bg-brand-cloud-blue"
                    style={{
                      left: `${cl.x}%`,
                      width: Math.min(14, 4 + cl.tasks.length * 2),
                    }}
                  />
                ))}
                <div
                  className="absolute top-0 h-4 w-px bg-red-500"
                  style={{ left: `${pct(view.today, range)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* The page: a queue */}
      {groups.map((g) =>
        g.tasks.length === 0 ? null : (
          <div key={g.label} className="mb-4">
            <div className="mb-1 flex items-baseline gap-2">
              <h3 className={`text-sm ${HEADING}`}>{g.label}</h3>
              <span className="text-xs text-gray-500 tabular-nums dark:text-gray-400">
                {g.tasks.length}
              </span>
            </div>
            <div
              className={`divide-y divide-gray-100 overflow-hidden dark:divide-gray-800 ${CARD}`}
            >
              {g.tasks.map((t) => (
                <div
                  key={t._id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                >
                  <Chip task={t} view={view} />
                  <div className="min-w-0 grow">
                    <div className="truncate text-sm text-gray-900 dark:text-gray-100">
                      {t.title}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      {campaignById.get(t.campaignId)?.title} · {t.kind}
                      {t.channel ? ` · ${t.channel}` : ''}
                    </div>
                  </div>
                  <div className="w-24 shrink-0 text-right text-xs text-gray-600 tabular-nums dark:text-gray-300">
                    {dayLabel(t.date)}
                    {t.provisional && (
                      <span className="text-amber-600"> ▲</span>
                    )}
                  </div>
                  <div className="w-24 shrink-0 text-right text-[11px] text-gray-500 dark:text-gray-400">
                    {STATUS_LABELS[t.status]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  )
}
