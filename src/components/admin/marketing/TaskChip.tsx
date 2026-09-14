'use client'

import clsx from 'clsx'
import {
  CheckIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  PhotoIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/solid'
import type { TaskView } from '@/lib/marketing/types'
import {
  MARKETING_CHANNEL_LABELS,
  TASK_KIND_LABELS,
} from '@/lib/marketing/types'
import { formatDateTimeSafe } from '@/lib/time'
import { KIND_SHAPES, type ChipTone } from './timeline-model'

const TONE: Record<ChipTone, string> = {
  complete:
    'border-green-600/40 bg-green-50 text-green-800 dark:border-green-400/40 dark:bg-green-900/40 dark:text-green-200',
  waiting:
    'border-dashed border-gray-400 bg-gray-50 text-gray-500 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-400',
  overdue:
    'border-red-500/60 bg-red-50 text-red-800 dark:border-red-400/60 dark:bg-red-900/40 dark:text-red-200',
  active:
    'border-blue-500/50 bg-blue-50 text-blue-800 dark:border-blue-400/50 dark:bg-blue-900/40 dark:text-blue-200',
  failed:
    'border-red-600 bg-red-100 text-red-900 dark:border-red-400 dark:bg-red-900/60 dark:text-red-100',
  planned:
    'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200',
  skipped:
    'border-gray-200 bg-gray-100 text-gray-400 line-through dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500',
}

/** The silhouette per Kind (spec §7: chips shaped by Kind). */
const SHAPE: Record<(typeof KIND_SHAPES)[keyof typeof KIND_SHAPES], string> = {
  pill: 'rounded-full px-1.5',
  square: 'rounded-sm',
  diamond: 'rotate-45 rounded-[3px] [&>*]:-rotate-45',
  tag: 'rounded-r-full rounded-l-sm px-1.5',
  tick: 'rounded-md',
}

const CHANNEL_GLYPH: Record<string, string> = { linkedin: 'in', bluesky: 'bs' }

function glyph(task: TaskView) {
  switch (task.kind) {
    case 'publishing':
      return (
        <span className="text-[10px] font-bold tracking-tight">
          {CHANNEL_GLYPH[task.channel ?? ''] ?? '•'}
        </span>
      )
    case 'studioRender':
      return <PhotoIcon className="size-3" />
    case 'speakerOutreach':
    case 'sponsorOutreach':
      return <PaperAirplaneIcon className="size-3" />
    case 'eventPageUpdate':
      return <LinkIcon className="size-3" />
    case 'checklist':
      return <CheckIcon className="size-3" />
  }
}

export function chipTitle(task: TaskView) {
  const kind = TASK_KIND_LABELS[task.kind]
  const channel = task.channel
    ? ` · ${MARKETING_CHANNEL_LABELS[task.channel]}`
    : ''
  const when = task.date ? ` · ${formatDateTimeSafe(task.date)}` : ''
  return `${task.title} (${kind}${channel})${when}`
}

export function TaskChip({
  task,
  tone,
  waiting,
  selected,
  onClick,
}: {
  task: TaskView
  tone: ChipTone
  waiting: boolean
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={chipTitle(task)}
      aria-label={chipTitle(task)}
      aria-pressed={selected}
      data-kind={task.kind}
      data-tone={tone}
      className={clsx(
        'relative flex h-5 min-w-5 items-center justify-center border text-[11px] leading-none shadow-xs transition hover:ring-2 hover:ring-brand-cloud-blue/60 focus-visible:ring-2 focus-visible:ring-brand-cloud-blue focus-visible:outline-none',
        SHAPE[KIND_SHAPES[task.kind]],
        TONE[tone],
        selected && 'ring-2 ring-brand-cloud-blue',
      )}
    >
      {glyph(task)}
      {waiting && (
        <ClockIcon
          aria-hidden
          className="absolute -top-1.5 -right-1.5 size-3 rounded-full bg-white text-gray-500 dark:bg-gray-900 dark:text-gray-300"
        />
      )}
      {task.provisional && (
        <ExclamationTriangleIcon
          aria-hidden
          className="absolute -right-1.5 -bottom-1.5 size-3 rounded-full bg-white text-amber-500 dark:bg-gray-900"
        />
      )}
    </button>
  )
}
