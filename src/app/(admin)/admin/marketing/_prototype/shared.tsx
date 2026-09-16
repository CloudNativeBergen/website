'use client'
/**
 * PROTOTYPE — throwaway. Bits every variant shares.
 *
 * Branding: reuses the REAL `TaskChip` (its tone map, Kind silhouettes and
 * accessible names) rather than restyling chips, and follows the admin
 * surface conventions — `rounded-xl border-gray-200 bg-white` with the
 * `dark:` pair, `font-space-grotesk` headings, `brand-cloud-blue` accents.
 */
import type { PlanView, TaskView } from '@/lib/marketing/types'
import { TaskChip, chipTitle } from '@/components/admin/marketing/TaskChip'
import {
  chipTone,
  isWaiting,
} from '@/components/admin/marketing/timeline-model'
import { type Filters } from './model'

/** The admin card surface, so every variant sits on the same material. */
export const CARD =
  'rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'

export const HEADING =
  'font-space-grotesk font-semibold text-gray-900 dark:text-white'

/** A Task rendered by the real chip; `label` adds the title beside it. */
export function Chip({
  task,
  view,
  label = false,
  onClick,
}: {
  task: TaskView
  view: PlanView
  label?: boolean
  onClick?: () => void
}) {
  const byId = new Map(view.tasks.map((t) => [t._id, t]))
  const waiting = isWaiting(task, byId)
  const tone = chipTone(task, waiting, view.today)
  const chip = (
    <TaskChip
      task={task}
      tone={tone}
      waiting={waiting}
      selected={false}
      onClick={onClick}
    />
  )
  if (!label) return chip
  return (
    <span
      className="inline-flex max-w-[15rem] items-center gap-1.5"
      title={chipTitle(task)}
    >
      {chip}
      <span className="truncate text-xs text-gray-700 dark:text-gray-300">
        {task.title}
      </span>
    </span>
  )
}

const KINDS: TaskView['kind'][] = [
  'publishing',
  'studioRender',
  'speakerOutreach',
  'sponsorOutreach',
  'eventPageUpdate',
  'checklist',
]

const SELECT =
  'rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'

export function FilterBar({
  view,
  filters,
  onChange,
  showing,
  total,
  children,
}: {
  view: PlanView
  filters: Filters
  onChange: (f: Filters) => void
  showing: number
  total: number
  children?: React.ReactNode
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  return (
    <div className={`mb-3 flex flex-wrap items-center gap-2 px-3 py-2 ${CARD}`}>
      <select
        aria-label="Status"
        className={SELECT}
        value={filters.status}
        onChange={(e) => set({ status: e.target.value as Filters['status'] })}
      >
        <option value="all">All statuses</option>
        <option value="overdue">Overdue</option>
        <option value="open">Open</option>
        <option value="done">Done</option>
      </select>
      <select
        aria-label="Kind"
        className={SELECT}
        value={filters.kind}
        onChange={(e) => set({ kind: e.target.value as Filters['kind'] })}
      >
        <option value="all">All kinds</option>
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <select
        aria-label="Channel"
        className={SELECT}
        value={filters.channel}
        onChange={(e) => set({ channel: e.target.value as Filters['channel'] })}
      >
        <option value="all">All channels</option>
        <option value="linkedin">LinkedIn</option>
        <option value="bluesky">Bluesky</option>
      </select>
      <select
        aria-label="Campaign"
        className={SELECT}
        value={filters.campaignId}
        onChange={(e) => set({ campaignId: e.target.value })}
      >
        <option value="all">All campaigns</option>
        {view.campaigns.map((c) => (
          <option key={c._id} value={c._id}>
            {c.title}
          </option>
        ))}
      </select>
      <span className="ml-auto text-xs text-gray-500 tabular-nums dark:text-gray-400">
        {showing} of {total} tasks
      </span>
      {children}
    </div>
  )
}
