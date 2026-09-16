'use client'
/**
 * PROTOTYPE — Variant A, "Dense board". Keeps the timeline as the primary
 * surface but makes it survive 94 Tasks: fixed Campaign gutter (#1086.1),
 * collapse to live Campaigns (#1086.2), clustering instead of stacking
 * (#1086.3), and a window around today (#1086.4).
 */
import { useMemo, useState } from 'react'
import type { PlanView, TaskView } from '@/lib/marketing/types'
import {
  campaignBand,
  pct,
  timelineRange,
  toMs,
} from '@/components/admin/marketing/timeline-model'
import {
  MILESTONE_LABELS,
  MILESTONE_LABEL_PX,
  gapPct,
  packByX,
} from '@/components/admin/marketing/timeline-model'
import type { Milestone } from '@/lib/marketing/milestones'
import {
  NO_FILTERS,
  clusterByX,
  filterTasks,
  liveCampaignIds,
  windowRange,
  type Filters,
} from './model'
import { Chip, FilterBar } from './shared'

const BOARD = 1100
const WINDOWS: { label: string; weeks: number | null }[] = [
  { label: '±4 wk', weeks: 4 },
  { label: '±3 mo', weeks: 13 },
  { label: 'Whole plan', weeks: null },
]

export const NAME = 'Dense board'

export function VariantA({ view }: { view: PlanView }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [weeks, setWeeks] = useState<number | null>(13)
  const [open, setOpen] = useState<Set<string>>(() => liveCampaignIds(view))
  const [burst, setBurst] = useState<string | null>(null)

  const full = useMemo(() => timelineRange(view), [view])
  const range = useMemo(
    () => windowRange(full, view.today, weeks),
    [full, view.today, weeks],
  )
  const shown = useMemo(
    () => filterTasks(view.tasks, filters, view.today),
    [view.tasks, filters, view.today],
  )
  const inWindow = shown.filter((t) => {
    const ms = toMs(t.date)
    return Number.isFinite(ms) && ms >= range.start && ms <= range.end
  })

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const milestones = (Object.keys(view.milestones) as Milestone[]).filter(
    (m) => {
      const ms = toMs(view.milestones[m]?.date)
      return Number.isFinite(ms) && ms >= range.start && ms <= range.end
    },
  )

  const { rowOf: mRowOf, rows: mRows } = packByX(
    milestones.map((m) => ({
      id: m,
      x: pct(view.milestones[m]?.date, range),
    })),
    gapPct(MILESTONE_LABEL_PX, BOARD),
  )

  return (
    <div>
      <FilterBar
        view={view}
        filters={filters}
        onChange={setFilters}
        showing={inWindow.length}
        total={view.tasks.length}
      >
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.label}
              onClick={() => setWeeks(w.weeks)}
              className={`rounded-md px-2 py-1 text-xs ring-1 ${
                weeks === w.weeks
                  ? 'bg-gray-900 text-white ring-gray-900'
                  : 'bg-white text-gray-700 ring-gray-300'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {/* Milestone axis, only what is inside the window */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <div className="w-56 shrink-0 px-3 py-2 text-xs font-semibold text-gray-500">
            Campaign
          </div>
          <div className="relative grow" style={{ height: 14 + mRows * 24 }}>
            {milestones.map((m) => (
              <div
                key={m}
                className="absolute -translate-x-1/2 text-center"
                style={{
                  left: `${pct(view.milestones[m]?.date, range)}%`,
                  top: 4 + (mRowOf.get(m) ?? 0) * 24,
                }}
              >
                <div className="text-[10px] leading-tight font-medium whitespace-nowrap text-gray-700">
                  {MILESTONE_LABELS[m]}
                </div>
                <div className="text-[10px] text-gray-400">
                  {view.milestones[m]?.provisional ? '▲ provisional' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        {view.campaigns.map((c) => {
          const tasks = inWindow.filter((t) => t.campaignId === c._id)
          const all = shown.filter((t) => t.campaignId === c._id)
          const band = campaignBand(c, all, range)
          const expanded = open.has(c._id)
          const clusters = clusterByX(tasks, range, BOARD)
          const done = all.filter((t) => t.complete).length
          return (
            <div
              key={c._id}
              className="flex border-b border-gray-100 last:border-0"
            >
              {/* FIXED GUTTER — every title at the same x (#1086.1) */}
              <button
                onClick={() => toggle(c._id)}
                className="w-56 shrink-0 border-r border-gray-100 px-3 py-2 text-left hover:bg-gray-50"
              >
                <div className="flex items-center gap-1 text-xs font-semibold text-gray-900">
                  <span className="text-gray-400">{expanded ? '▾' : '▸'}</span>
                  <span className="truncate">{c.title}</span>
                </div>
                <div className="pl-4 text-[11px] text-gray-500 tabular-nums">
                  {done}/{all.length} · {c.primaryOutcome}
                  {tasks.length < all.length && (
                    <span className="text-gray-400">
                      {' '}
                      · {all.length - tasks.length} outside window
                    </span>
                  )}
                </div>
              </button>

              <div
                className="relative grow"
                style={{ height: expanded ? 56 : 30 }}
              >
                <div
                  className="absolute top-2 h-1.5 rounded-full bg-blue-400/70"
                  style={{ left: `${band.left}%`, width: `${band.width}%` }}
                />
                {expanded &&
                  clusters.map((cl) => (
                    <div
                      key={cl.x}
                      className="absolute -translate-x-1/2"
                      style={{ left: `${cl.x}%`, top: 22 }}
                    >
                      {cl.tasks.length === 1 ? (
                        <Chip task={cl.tasks[0]} view={view} />
                      ) : (
                        /* CLUSTER — the fix for unbounded lane height (#1086.3) */
                        <button
                          onClick={() =>
                            setBurst(
                              burst === `${c._id}:${cl.x}`
                                ? null
                                : `${c._id}:${cl.x}`,
                            )
                          }
                          className="h-6 rounded-full bg-gray-900 px-2 text-[11px] font-semibold text-white"
                        >
                          {cl.tasks.length}
                        </button>
                      )}
                    </div>
                  ))}
                {expanded &&
                  clusters
                    .filter((cl) => burst === `${c._id}:${cl.x}`)
                    .map((cl) => (
                      <div
                        key={`b${cl.x}`}
                        className="absolute z-10 w-64 -translate-x-1/2 rounded-lg border border-gray-300 bg-white p-2 shadow-lg"
                        style={{ left: `${cl.x}%`, top: 48 }}
                      >
                        <div className="mb-1 text-[11px] font-semibold text-gray-500">
                          {cl.tasks.length} tasks here
                        </div>
                        <div className="flex flex-col gap-1">
                          {cl.tasks.map((t: TaskView) => (
                            <Chip key={t._id} task={t} view={view} label />
                          ))}
                        </div>
                      </div>
                    ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Collapsed campaigns are those not running today. Numbered chips hold
        several tasks — click to open.
      </p>
    </div>
  )
}
