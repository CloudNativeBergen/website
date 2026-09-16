'use client'
/** PROTOTYPE — throwaway. Bits every variant shares: filter bar, chip, legend. */
import type { PlanView, TaskView } from '@/lib/marketing/types'
import {
  KIND_SHAPES,
  STATUS_LABELS,
  chipTone,
  isWaiting,
  type ChipTone,
} from '@/components/admin/marketing/timeline-model'
import { type Filters } from './model'

export const TONE_CLASS: Record<ChipTone, string> = {
  complete: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  waiting: 'bg-white text-gray-500 ring-gray-300 border-dashed',
  overdue: 'bg-red-100 text-red-800 ring-red-400',
  failed: 'bg-red-600 text-white ring-red-700',
  active: 'bg-blue-100 text-blue-800 ring-blue-300',
  planned: 'bg-gray-100 text-gray-700 ring-gray-300',
  skipped: 'bg-gray-50 text-gray-400 ring-gray-200 line-through',
}

const KIND_GLYPH: Record<TaskView['kind'], string> = {
  publishing: '',
  studioRender: '▣',
  speakerOutreach: '◆',
  sponsorOutreach: '◆',
  eventPageUpdate: '⛭',
  checklist: '✓',
}

export function channelLabel(t: TaskView) {
  if (t.kind !== 'publishing') return KIND_GLYPH[t.kind]
  return t.channel === 'linkedin' ? 'in' : 'bs'
}

/** A labelled chip — the prototype's answer to 94 anonymous tokens. */
export function Chip({
  task,
  view,
  label = false,
}: {
  task: TaskView
  view: PlanView
  label?: boolean
}) {
  const byId = new Map(view.tasks.map((t) => [t._id, t]))
  const waiting = isWaiting(task, byId)
  const tone = chipTone(task, waiting, view.today)
  const shape = KIND_SHAPES[task.kind]
  return (
    <span
      title={`${task.title} — ${STATUS_LABELS[task.status]}`}
      className={`inline-flex h-6 shrink-0 items-center gap-1 px-1.5 text-[11px] font-semibold ring-1 ${TONE_CLASS[tone]} ${
        shape === 'pill'
          ? 'rounded-full'
          : shape === 'diamond'
            ? 'rotate-0 rounded-sm'
            : 'rounded'
      } ${label ? 'max-w-[13rem]' : ''}`}
    >
      <span className="tabular-nums">{channelLabel(task)}</span>
      {label && <span className="truncate font-normal">{task.title}</span>}
      {task.provisional && <span className="text-amber-600">▲</span>}
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

/** Filters apply to every variant — they are orthogonal to layout (#1085). */
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
  const sel =
    'rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800'
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
      <select
        aria-label="Status"
        className={sel}
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
        className={sel}
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
        className={sel}
        value={filters.channel}
        onChange={(e) => set({ channel: e.target.value as Filters['channel'] })}
      >
        <option value="all">All channels</option>
        <option value="linkedin">LinkedIn</option>
        <option value="bluesky">Bluesky</option>
      </select>
      <select
        aria-label="Campaign"
        className={sel}
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
      <span className="ml-auto text-xs text-gray-500 tabular-nums">
        {showing} of {total} tasks
      </span>
      {children}
    </div>
  )
}
