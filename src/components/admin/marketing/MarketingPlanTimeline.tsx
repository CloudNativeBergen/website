'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import {
  ClockIcon,
  ExclamationTriangleIcon,
  FlagIcon,
} from '@heroicons/react/24/outline'
import { MILESTONES, type Milestone } from '@/lib/marketing/milestones'
import {
  MARKETING_CHANNEL_LABELS,
  OUTCOME_LABELS,
  TASK_KIND_LABELS,
  type PlanView,
  type TaskView,
} from '@/lib/marketing/types'
import { formatConferenceDateShort, formatDateTimeSafe } from '@/lib/time'
import { TaskChip } from './TaskChip'
import {
  chipTone,
  isWaiting,
  MILESTONE_LABELS,
  milestoneSettingsHref,
  packMilestones,
  packRows,
  pct,
  timelineRange,
  type ChipTone,
} from './timeline-model'

const ROW_HEIGHT = 26
const LANE_HEADER = 30

const STATUS_LABELS: Record<TaskView['status'], string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  'awaiting-manual': 'Post by hand',
  published: 'Published',
  failed: 'Failed',
  open: 'Open',
  done: 'Done',
  skipped: 'Skipped',
}

/**
 * The plan on the edition's Milestone axis (spec §7, variant A of the
 * prototype): Campaigns as swimlanes, Tasks as Kind-shaped chips, a today
 * line, amber flags on provisional dates that link to the settings field
 * that fixes them, and a clock on chips waiting for an open Prerequisite.
 * Clicking a chip opens its details below the board; editing is a later
 * ticket.
 */
export function MarketingPlanTimeline({ view }: { view: PlanView }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const range = useMemo(() => timelineRange(view), [view])
  const byId = useMemo(
    () => new Map(view.tasks.map((t) => [t._id, t])),
    [view.tasks],
  )
  const lanes = useMemo(
    () =>
      view.campaigns.map((campaign) => {
        const tasks = view.tasks.filter((t) => t.campaignId === campaign._id)
        const { rowOf, rows } = packRows(tasks, range)
        return { campaign, tasks, rowOf, rows }
      }),
    [view, range],
  )
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null

  const provisionalMilestones = MILESTONES.filter(
    (m) => view.milestones[m]?.provisional,
  )

  return (
    <div className="space-y-4">
      {provisionalMilestones.length > 0 && (
        <ProvisionalNotice milestones={provisionalMilestones} />
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="relative min-w-[960px] p-5">
          <MilestoneAxis view={view} range={range} />

          <div className="relative mt-3 space-y-2">
            <TodayLine today={view.today} range={range} />
            {lanes.map(({ campaign, tasks, rowOf, rows }) => {
              const left = pct(campaign.startDate, range)
              const width = Math.max(0.5, pct(campaign.endDate, range) - left)
              return (
                <div
                  key={campaign._id}
                  data-campaign={campaign.key}
                  className="relative rounded-lg bg-gray-50 dark:bg-gray-800/60"
                  style={{ height: LANE_HEADER + rows * ROW_HEIGHT }}
                >
                  <div
                    className={clsx(
                      'absolute top-2 h-1.5 rounded-full',
                      campaign.provisional
                        ? 'bg-amber-400/80'
                        : 'bg-brand-cloud-blue/70',
                    )}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                  <div
                    className="absolute top-3.5 flex max-w-[40%] items-center gap-1.5 truncate text-xs font-semibold whitespace-nowrap text-gray-800 dark:text-gray-100"
                    style={{ left: `${Math.min(left, 70)}%` }}
                  >
                    {campaign.title}
                    <span className="font-normal text-gray-500 dark:text-gray-400">
                      {tasks.filter((t) => t.complete).length}/{tasks.length} ·{' '}
                      {OUTCOME_LABELS[campaign.primaryOutcome].toLowerCase()}
                      {campaign.target !== null
                        ? ` · target ${campaign.target}`
                        : ''}
                    </span>
                    {campaign.provisional && (
                      <ExclamationTriangleIcon
                        className="size-3.5 text-amber-500"
                        title="Window on a provisional date"
                      />
                    )}
                  </div>
                  {tasks.map((task) => {
                    const row = rowOf.get(task._id)
                    if (row === undefined) return null
                    const waiting = isWaiting(task, byId)
                    return (
                      <div
                        key={task._id}
                        className="absolute -translate-x-1/2"
                        style={{
                          left: `${pct(task.date, range)}%`,
                          top: LANE_HEADER + row * ROW_HEIGHT,
                        }}
                      >
                        <TaskChip
                          task={task}
                          tone={chipTone(task, waiting, view.today)}
                          waiting={waiting}
                          selected={task._id === selectedId}
                          onClick={() =>
                            setSelectedId((id) =>
                              id === task._id ? null : task._id,
                            )
                          }
                        />
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <Legend />

      {selected && (
        <TaskDetails
          task={selected}
          byId={byId}
          tone={chipTone(selected, isWaiting(selected, byId), view.today)}
          campaignTitle={
            view.campaigns.find((c) => c._id === selected.campaignId)?.title ??
            ''
          }
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

const AXIS_ROW = 44

function MilestoneAxis({
  view,
  range,
}: {
  view: PlanView
  range: ReturnType<typeof timelineRange>
}) {
  const { rowOf, rows } = packMilestones(view.milestones, range)
  return (
    <div
      className="relative border-b border-gray-200 dark:border-gray-800"
      style={{ height: rows * AXIS_ROW + 4 }}
    >
      {MILESTONES.filter((m) => view.milestones[m]).map((m) => {
        const { date, provisional } = view.milestones[m]
        const label = (
          <>
            <FlagIcon
              className={clsx(
                'mx-auto size-4',
                provisional ? 'text-amber-500' : 'text-gray-500',
              )}
            />
            <p className="mt-0.5 text-[11px] leading-tight font-medium text-gray-700 dark:text-gray-200">
              {MILESTONE_LABELS[m]}
            </p>
            <p className="text-[10px] text-gray-400">
              {formatConferenceDateShort(date)}
              {provisional ? ' · provisional' : ''}
            </p>
          </>
        )
        return (
          <div
            key={m}
            data-milestone={m}
            className="absolute -translate-x-1/2 text-center whitespace-nowrap"
            style={{
              left: `${pct(date, range)}%`,
              top: (rowOf.get(m) ?? 0) * AXIS_ROW,
            }}
          >
            {provisional ? (
              <Link
                href={milestoneSettingsHref(m)}
                className="block rounded hover:bg-amber-50 dark:hover:bg-amber-900/30"
                title={`${MILESTONE_LABELS[m]} is not set; this date is a fallback. Set it in settings.`}
              >
                {label}
              </Link>
            ) : (
              label
            )}
          </div>
        )
      })}
    </div>
  )
}

function TodayLine({
  today,
  range,
}: {
  today: string
  range: ReturnType<typeof timelineRange>
}) {
  const x = pct(today, range)
  return (
    <div
      data-today
      className="pointer-events-none absolute inset-y-0 z-10 w-px bg-red-500"
      style={{ left: `${x}%` }}
    >
      <span className="absolute -top-1 -translate-x-1/2 rounded bg-red-500 px-1 text-[10px] font-semibold text-white">
        today
      </span>
    </div>
  )
}

function ProvisionalNotice({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
      <ExclamationTriangleIcon className="size-4 shrink-0 text-amber-500" />
      <span>
        {milestones.length === 1
          ? 'One Milestone is'
          : `${milestones.length} Milestones are`}{' '}
        unset; their Tasks sit on fallback dates until you set them:
      </span>
      {milestones.map((m) => (
        <Link
          key={m}
          href={milestoneSettingsHref(m)}
          className="font-medium underline decoration-amber-500/60 underline-offset-2 hover:decoration-amber-700"
        >
          {MILESTONE_LABELS[m]}
        </Link>
      ))}
    </div>
  )
}

function Legend() {
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-5 rounded-full border border-gray-400" />
        <dd>Post (in = LinkedIn, bs = Bluesky)</dd>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block size-3 rounded-sm border border-gray-400" />
        <dd>Studio render</dd>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rotate-45 border border-gray-400" />
        <dd>Outreach</dd>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-l-sm rounded-r-full border border-gray-400" />
        <dd>Event page</dd>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block size-3 rounded-md border border-gray-400" />
        <dd>Checklist</dd>
      </div>
      <div className="flex items-center gap-1.5">
        <ClockIcon className="size-3.5" />
        <dd>Waiting on a Prerequisite</dd>
      </div>
      <div className="flex items-center gap-1.5">
        <ExclamationTriangleIcon className="size-3.5 text-amber-500" />
        <dd>Provisional date</dd>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-px bg-red-500" />
        <dd>Today</dd>
      </div>
    </dl>
  )
}

function TaskDetails({
  task,
  byId,
  tone,
  campaignTitle,
  onClose,
}: {
  task: TaskView
  byId: Map<string, TaskView>
  tone: ChipTone
  campaignTitle: string
  onClose: () => void
}) {
  const prerequisites = task.prerequisiteIds
    .map((id) => byId.get(id))
    .filter((t): t is TaskView => t !== undefined)
  return (
    <section
      aria-label="Task details"
      className="rounded-xl border border-gray-200 bg-white p-4 text-sm dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {campaignTitle}
          </p>
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {task.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
        >
          Close
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <Field label="Kind">
          {TASK_KIND_LABELS[task.kind]}
          {task.channel ? ` · ${MARKETING_CHANNEL_LABELS[task.channel]}` : ''}
        </Field>
        <Field label={task.kind === 'publishing' ? 'Scheduled' : 'Due'}>
          {task.date ? formatDateTimeSafe(task.date) : 'Not scheduled'}
        </Field>
        <Field label="Status">
          {STATUS_LABELS[task.status]}
          {tone === 'overdue' && !task.complete ? ' · overdue' : ''}
        </Field>
        <Field label="Key">
          <code className="text-xs">{task.key}</code>
        </Field>
      </dl>
      {task.provisional && (
        <p className="mt-3 flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
          <ExclamationTriangleIcon className="size-4 text-amber-500" />
          Provisional date:{' '}
          {task.milestone
            ? MILESTONE_LABELS[task.milestone]
            : 'its Milestone'}{' '}
          is not set.{' '}
          <Link
            href={milestoneSettingsHref(task.milestone)}
            className="underline underline-offset-2"
          >
            Set it
          </Link>
        </p>
      )}
      {prerequisites.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Prerequisites
          </p>
          <ul className="mt-1 space-y-0.5">
            {prerequisites.map((p) => (
              <li key={p._id} className="flex items-center gap-1.5">
                {p.complete ? (
                  <span className="text-green-600">✓</span>
                ) : (
                  <ClockIcon className="size-3.5 text-gray-500" />
                )}
                {p.title}
                <span className="text-xs text-gray-500">
                  · {STATUS_LABELS[p.status]}
                </span>
              </li>
            ))}
          </ul>
          {isWaiting(task, byId) && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Waiting: shown, never enforced. The Task can still be approved.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  )
}
