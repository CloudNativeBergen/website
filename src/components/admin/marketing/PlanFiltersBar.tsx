'use client'

import {
  AdminFilterBar,
  type FilterGroup,
} from '@/components/admin/AdminFilterBar'
import {
  MARKETING_CHANNEL_LABELS,
  TASK_KIND_LABELS,
  type PlanView,
} from '@/lib/marketing/types'
import { STATUS_LABELS } from './timeline-model'
import type { PlanFilters } from './plan-filters'

export function PlanFiltersBar({
  view,
  filters,
  update,
  count,
  clear,
}: {
  view: PlanView
  filters: PlanFilters
  update: (patch: Partial<PlanFilters>) => void
  count: number
  clear: () => void
}) {
  function multi(
    key: 'status' | 'kind' | 'channel' | 'campaign' | 'assignee',
    label: string,
    options: Record<string, string>,
  ): FilterGroup {
    const selected: string[] = filters[key]
    return {
      key,
      label,
      selected,
      options: Object.entries(options).map(([value, label]) => ({
        value,
        label,
      })),
      onChange: (value) =>
        update({
          [key]: selected.includes(value)
            ? selected.filter((v) => v !== value)
            : [...selected, value],
        }),
    }
  }
  const groups: FilterGroup[] = [
    {
      key: 'sort',
      label: 'Sort',
      multi: false,
      selected: filters.sort === 'overdue' ? [] : [filters.sort],
      options: [
        { value: 'overdue', label: 'Overdue first, then due date' },
        { value: 'date', label: 'Due date' },
      ],
      onChange: (value) => update({ sort: value as PlanFilters['sort'] }),
    },
    multi('status', 'Status', STATUS_LABELS),
    multi('kind', 'Kind', TASK_KIND_LABELS),
    multi('channel', 'Channel', MARKETING_CHANNEL_LABELS),
    multi(
      'campaign',
      'Campaign',
      Object.fromEntries(view.campaigns.map((c) => [c._id, c.title])),
    ),
    multi('assignee', 'Assignee', {
      ...(view.viewerId ? { me: 'Mine' } : {}),
      ...Object.fromEntries(view.organizers.map((o) => [o._id, o.name])),
    }),
    {
      key: 'due',
      label: 'Due',
      multi: false,
      selected: filters.due === 'all' ? [] : [filters.due],
      options: [
        { value: 'all', label: 'Any date' },
        { value: 'overdue', label: 'Overdue' },
        { value: 'next14', label: 'Next 14 days' },
        { value: 'later', label: 'Later' },
      ],
      onChange: (value) => update({ due: value as PlanFilters['due'] }),
    },
    {
      key: 'flag',
      label: 'Progress',
      multi: false,
      selected: filters.flag === 'any' ? [] : [filters.flag],
      options: [
        { value: 'any', label: 'Any progress' },
        { value: 'done', label: 'Tasks done' },
        { value: 'waiting', label: 'Waiting' },
        { value: 'overdue', label: 'Overdue' },
      ],
      onChange: (value) => update({ flag: value as PlanFilters['flag'] }),
    },
  ]
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Plan view" className="flex gap-1">
        {(['timeline', 'list'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filters.view === value}
            onClick={() => update({ view: value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 aria-pressed:bg-blue-100 aria-pressed:text-blue-900 dark:border-gray-600 dark:text-gray-100 dark:aria-pressed:bg-blue-900 dark:aria-pressed:text-white"
          >
            {value === 'timeline' ? 'Timeline' : 'Task list'}
          </button>
        ))}
      </div>
      {filters.view === 'timeline' && (
        <label className="text-sm text-gray-700 dark:text-gray-200">
          Time window{' '}
          <select
            aria-label="Time window"
            value={filters.axis}
            onChange={(event) =>
              update({ axis: event.target.value as PlanFilters['axis'] })
            }
            className="rounded-md border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-900"
          >
            <option value="plan">Whole plan</option>
            <option value="fromToday">From this week</option>
            <option value="next8w">Next 8 weeks</option>
          </select>
        </label>
      )}
    </div>
  )
  return (
    <AdminFilterBar
      variant="card"
      filters={groups}
      resultCount={count}
      totalCount={view.tasks.length}
      resultLabel="tasks"
      onClearAll={clear}
      desktopExtra={controls}
      sheetExtra={controls}
    />
  )
}
