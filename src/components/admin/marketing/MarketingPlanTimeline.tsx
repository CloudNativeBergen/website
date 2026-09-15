'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import {
  ClockIcon,
  ExclamationTriangleIcon,
  FlagIcon,
} from '@heroicons/react/24/outline'
import { MILESTONES, type Milestone } from '@/lib/marketing/milestones'
import { OUTCOME_LABELS, type PlanView } from '@/lib/marketing/types'
import { formatConferenceDateShort } from '@/lib/time'
import { TaskChip } from './TaskChip'
import { TaskQuickPopover } from './TaskQuickPopover'
import {
  campaignBand,
  chipTone,
  isWaiting,
  MIN_BOARD_WIDTH_PX,
  MILESTONE_LABELS,
  milestoneSettingsHref,
  packMilestones,
  packRows,
  pct,
  timelineRange,
} from './timeline-model'

const ROW_HEIGHT = 26
const LANE_HEADER = 30

/**
 * The plan on the edition's Milestone axis (spec §7, variant A of the
 * prototype): Campaigns as swimlanes, Tasks as Kind-shaped chips, a today
 * line, amber flags on provisional dates that link to the settings field
 * that fixes them, and a clock on chips waiting for an open Prerequisite.
 * Clicking a chip opens the quick popover (assignee, date, approve, and the
 * way to the full editor, #1012).
 */
export function MarketingPlanTimeline({ view }: { view: PlanView }) {
  const boardRef = useRef<HTMLDivElement>(null)
  const boardWidth = useElementWidth(boardRef)
  const range = useMemo(() => timelineRange(view), [view])
  const byId = useMemo(
    () => new Map(view.tasks.map((t) => [t._id, t])),
    [view.tasks],
  )
  const lanes = useMemo(
    () =>
      view.campaigns.map((campaign) => {
        const tasks = view.tasks.filter((t) => t.campaignId === campaign._id)
        const { rowOf, rows } = packRows(tasks, range, boardWidth)
        return { campaign, tasks, rowOf, rows }
      }),
    [view, range, boardWidth],
  )
  const provisionalMilestones = MILESTONES.filter(
    (m) => view.milestones[m]?.provisional,
  )

  return (
    <div className="space-y-4">
      {provisionalMilestones.length > 0 && (
        <ProvisionalNotice milestones={provisionalMilestones} />
      )}

      {view.ceilingWarnings.length > 0 && (
        <CeilingNotice warnings={view.ceilingWarnings} />
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div ref={boardRef} className="relative min-w-[960px] p-5">
          <MilestoneAxis view={view} range={range} boardWidth={boardWidth} />

          <div className="relative mt-3 space-y-2">
            <TodayLine today={view.today} range={range} />
            {lanes.map(({ campaign, tasks, rowOf, rows }) => {
              const { left, width } = campaignBand(campaign, tasks, range)
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
                    className="absolute top-3.5 flex max-w-[40%] items-center gap-1.5 text-xs font-semibold whitespace-nowrap text-gray-800 dark:text-gray-100"
                    style={{ left: `${Math.min(left, 60)}%` }}
                    title={`${campaign.title} · ${OUTCOME_LABELS[campaign.primaryOutcome]}${campaign.target !== null ? ` · target ${campaign.target}` : ''}`}
                  >
                    <span className="shrink-0">{campaign.title}</span>
                    <span className="min-w-0 truncate font-normal text-gray-500 dark:text-gray-400">
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
                        <Popover>
                          {({ open, close }) => (
                            <>
                              <PopoverButton as={Fragment}>
                                <TaskChip
                                  task={task}
                                  tone={chipTone(task, waiting, view.today)}
                                  waiting={waiting}
                                  selected={open}
                                />
                              </PopoverButton>
                              <PopoverPanel
                                anchor="bottom start"
                                className="z-30 [--anchor-gap:6px]"
                              >
                                <TaskQuickPopover
                                  task={task}
                                  byId={byId}
                                  tone={chipTone(task, waiting, view.today)}
                                  waiting={waiting}
                                  campaignTitle={campaign.title}
                                  onDone={close}
                                />
                              </PopoverPanel>
                            </>
                          )}
                        </Popover>
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
    </div>
  )
}

const AXIS_ROW = 44

/** The rendered width of an element, re-measured on resize; SSR-safe. */
function useElementWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(MIN_BOARD_WIDTH_PX)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}

function MilestoneAxis({
  view,
  range,
  boardWidth,
}: {
  view: PlanView
  range: ReturnType<typeof timelineRange>
  boardWidth: number
}) {
  const { rowOf, rows } = packMilestones(view.milestones, range, boardWidth)
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
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
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
        unset; their Tasks and windows sit on fallback dates. Set them, then
        re-date the affected Tasks (automatic re-dating is a later ticket):
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

/** How many ceiling warnings show before the rest fold away. */
const CEILING_PREVIEW = 3

/** Channel ceilings the plan goes over (spec §5.4): a warning, never a block. */
function CeilingNotice({
  warnings,
}: {
  warnings: PlanView['ceilingWarnings']
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? warnings : warnings.slice(0, CEILING_PREVIEW)
  const hidden = warnings.length - shown.length
  return (
    <div
      role="status"
      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100"
    >
      <p className="flex items-center gap-2 font-medium">
        <ExclamationTriangleIcon className="size-4 shrink-0 text-amber-500" />
        {warnings.length === 1
          ? 'One channel ceiling is exceeded.'
          : `${warnings.length} channel ceilings are exceeded.`}{' '}
        <span className="font-normal">
          Posting this often tires the audience; move a post if you can.
        </span>
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-9">
        {shown.map((w) => (
          <li key={w.message}>{w.message}</li>
        ))}
      </ul>
      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 ml-9 text-xs font-medium underline decoration-amber-500/60 underline-offset-2 hover:decoration-amber-700"
        >
          {expanded ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
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
