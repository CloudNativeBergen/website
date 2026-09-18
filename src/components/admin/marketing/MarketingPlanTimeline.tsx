'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import {
  ClockIcon,
  ExclamationTriangleIcon,
  FlagIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { MILESTONES, type Milestone } from '@/lib/marketing/milestones'
import {
  OUTCOME_LABELS,
  type PlanView,
  type TaskView,
} from '@/lib/marketing/types'
import { formatConferenceDateShort } from '@/lib/time'
import { TaskChip } from './TaskChip'
import { TaskQuickPopover } from './TaskQuickPopover'
import {
  chipTone,
  isWaiting,
  MILESTONE_LABELS,
  milestoneSettingsHref,
  focusWeeks,
  clusterByWeek,
  columnInBand,
  defaultExpanded,
  laneHeight,
  MAX_CHIPS_PER_CELL,
  weekStartMs,
  weekStartIso,
  toMs,
} from './timeline-model'

/** Campaign lanes over a discontinuous axis of weeks containing work. */
export function MarketingPlanTimeline({
  view,
  tasks = view.tasks,
  axis = 'plan',
  expanded,
  onExpandedChange,
}: {
  view: PlanView
  tasks?: TaskView[]
  axis?: 'plan' | 'fromToday' | 'next8w'
  expanded?: Set<string>
  onExpandedChange?: (ids: Set<string>) => void
}) {
  const [localExpanded, setLocalExpanded] = useState(() =>
    defaultExpanded(view.campaigns, view.today),
  )
  const expandedIds = expanded ?? localExpanded
  const weeks = useMemo(
    () => focusWeeks(view, tasks, axis),
    [view, tasks, axis],
  )
  const byId = useMemo(
    () => new Map(view.tasks.map((t) => [t._id, t])),
    [view.tasks],
  )
  const todayWeek = weekStartMs(toMs(view.today))
  const columns = weeks.flatMap((w) =>
    w.quietWeeksBefore > 0
      ? [
          { kind: 'gap' as const, ...w },
          { kind: 'week' as const, ...w },
        ]
      : [{ kind: 'week' as const, ...w }],
  )
  const template = `minmax(11rem, 13rem) ${columns.map((c) => (c.kind === 'gap' ? '3rem' : 'minmax(8rem, 1fr)')).join(' ')}`
  const provisionalMilestones = MILESTONES.filter(
    (m) => view.milestones[m]?.provisional,
  )
  function toggle(id: string) {
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    if (onExpandedChange) onExpandedChange(next)
    else setLocalExpanded(next)
  }
  return (
    <div className="space-y-4">
      {provisionalMilestones.length > 0 && (
        <ProvisionalNotice milestones={provisionalMilestones} />
      )}
      {view.ceilingWarnings.length > 0 && (
        <CeilingNotice warnings={view.ceilingWarnings} />
      )}
      <div
        role="region"
        aria-label="Marketing plan timeline"
        tabIndex={0}
        className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
      >
        <div
          className="grid min-w-full"
          style={{ gridTemplateColumns: template }}
        >
          <div className="sticky left-0 z-20 border-b border-gray-200 bg-white p-3 text-xs font-semibold dark:border-gray-800 dark:bg-gray-900">
            Campaigns
          </div>
          {columns.map((c) => (
            <div
              key={`${c.kind}-${c.start}`}
              className={clsx(
                'border-b border-l border-gray-200 p-2 text-xs dark:border-gray-800',
                c.start === todayWeek &&
                  c.kind === 'week' &&
                  'bg-red-50 dark:bg-red-950/30',
              )}
            >
              {c.kind === 'gap' ? (
                <div className="border-l border-dashed border-gray-300 pl-1 text-[10px] text-gray-500 dark:border-gray-600">
                  {c.quietWeeksBefore} quiet{' '}
                  {c.quietWeeksBefore === 1 ? 'week' : 'weeks'}
                </div>
              ) : (
                <>
                  <p className="font-semibold text-gray-700 dark:text-gray-200">
                    {formatConferenceDateShort(weekStartIso(c.start))}
                  </p>
                  {c.start === todayWeek && (
                    <p
                      data-today
                      className="text-[10px] font-semibold text-red-600 dark:text-red-300"
                    >
                      This week
                    </p>
                  )}
                  {MILESTONES.filter(
                    (m) =>
                      weekStartMs(toMs(view.milestones[m]?.date)) === c.start,
                  ).map((m) => (
                    <MilestoneLabel key={m} milestone={m} view={view} />
                  ))}
                </>
              )}
            </div>
          ))}
          {view.campaigns.map((campaign) => {
            const all = view.tasks.filter((t) => t.campaignId === campaign._id)
            const filtered = tasks.filter((t) => t.campaignId === campaign._id)
            const cells = clusterByWeek(filtered, weeks, MAX_CHIPS_PER_CELL)
            const open = expandedIds.has(campaign._id)
            const height = open ? laneHeight(cells) : 48
            return (
              <Fragment key={campaign._id}>
                <div
                  data-campaign={campaign.key}
                  data-expanded={open}
                  className="sticky left-0 z-20 flex items-start gap-1 border-b border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900"
                  style={{ height }}
                >
                  <button
                    type="button"
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${campaign.title}`}
                    aria-expanded={open}
                    onClick={() => toggle(campaign._id)}
                    className="mt-0.5 shrink-0 rounded p-1 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:hover:bg-gray-800"
                  >
                    <ChevronRightIcon
                      className={clsx(
                        'size-4 transition-transform',
                        open && 'rotate-90',
                      )}
                    />
                  </button>
                  <div className="min-w-0">
                    <Link
                      href={`/admin/marketing/campaigns/${campaign._id}`}
                      className="block truncate text-xs font-semibold text-gray-800 hover:underline dark:text-gray-100"
                      title={`${campaign.title} · ${OUTCOME_LABELS[campaign.primaryOutcome]}`}
                    >
                      {campaign.title}
                    </Link>
                    <p className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                      {all.filter((t) => t.complete).length}/{all.length} done{' '}
                      {campaign.provisional && (
                        <ExclamationTriangleIcon
                          className="size-3 text-amber-500"
                          title="Window on a provisional date"
                        />
                      )}
                    </p>
                  </div>
                </div>
                {columns.map((c) => {
                  const cell = cells.get(c.start)
                  const inBand = columnInBand(c, campaign)
                  return (
                    <div
                      key={`${campaign._id}-${c.kind}-${c.start}`}
                      data-week-cell
                      style={{ height }}
                      className={clsx(
                        'min-w-0 border-b border-l border-gray-200 px-2 pt-2 dark:border-gray-800',
                        c.kind === 'week' &&
                          c.start === todayWeek &&
                          'bg-red-50/50 dark:bg-red-950/20',
                      )}
                    >
                      {inBand && (
                        <div
                          aria-hidden
                          className={clsx(
                            'mb-2 h-1 rounded-full',
                            campaign.provisional
                              ? 'bg-amber-400/80'
                              : 'bg-brand-cloud-blue/60',
                          )}
                        />
                      )}
                      {open && c.kind === 'week' && cell && (
                        <div className="space-y-1.5">
                          {cell.shown.map((task) => (
                            <QuickTask
                              key={task._id}
                              task={task}
                              view={view}
                              byId={byId}
                              campaignTitle={campaign.title}
                            />
                          ))}
                          {cell.hidden.length > 0 && (
                            <Popover>
                              <PopoverButton
                                className="w-full rounded border border-gray-300 bg-white px-1.5 py-0.5 text-left text-[11px] font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                                aria-label={`${cell.hidden.length} more tasks in ${campaign.title}, week of ${formatConferenceDateShort(weekStartIso(c.start))}`}
                              >
                                +{cell.hidden.length} tasks
                              </PopoverButton>
                              <PopoverPanel
                                anchor="bottom start"
                                className="z-30 max-h-80 w-72 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 shadow-lg [--anchor-gap:6px] dark:border-gray-700 dark:bg-gray-900"
                              >
                                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                  {cell.hidden.length} more tasks ·{' '}
                                  {campaign.title}
                                </p>
                                {cell.hidden.map((task) => (
                                  <Link
                                    key={task._id}
                                    href={`/admin/marketing/tasks/${task._id}`}
                                    className="block rounded p-1 text-sm text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                                  >
                                    {task.title}
                                  </Link>
                                ))}
                              </PopoverPanel>
                            </Popover>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </Fragment>
            )
          })}
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Only weeks containing work or plan landmarks are shown. Quiet weeks
        collapse into labelled rules. Undated tasks are available in the list.
      </p>
      <Legend />
    </div>
  )
}

function QuickTask({
  task,
  view,
  byId,
  campaignTitle,
}: {
  task: TaskView
  view: PlanView
  byId: Map<string, TaskView>
  campaignTitle: string
}) {
  const waiting = isWaiting(task, byId)
  const tone = chipTone(task, waiting, view.today)
  return (
    <Popover>
      {({ open, close }) => (
        <>
          <PopoverButton as={Fragment}>
            <TaskChip
              task={task}
              tone={tone}
              waiting={waiting}
              selected={open}
              label
            />
          </PopoverButton>
          <PopoverPanel
            anchor="bottom start"
            className="z-30 [--anchor-gap:6px]"
          >
            <TaskQuickPopover
              task={task}
              milestoneStillUnset={
                task.milestone
                  ? (view.milestones[task.milestone]?.provisional ?? false)
                  : false
              }
              byId={byId}
              tone={tone}
              waiting={waiting}
              campaignTitle={campaignTitle}
              onDone={close}
            />
          </PopoverPanel>
        </>
      )}
    </Popover>
  )
}

function MilestoneLabel({
  milestone,
  view,
}: {
  milestone: Milestone
  view: PlanView
}) {
  const { date, provisional } = view.milestones[milestone]
  const label = (
    <>
      <FlagIcon
        className={clsx(
          'inline size-3',
          provisional ? 'text-amber-500' : 'text-gray-500',
        )}
      />{' '}
      {MILESTONE_LABELS[milestone]}
      <span className="block text-[10px] text-gray-500 dark:text-gray-400">
        {formatConferenceDateShort(date)}
        {provisional ? ' · provisional' : ''}
      </span>
    </>
  )
  return (
    <div
      data-milestone={milestone}
      className="mt-2 text-[11px] leading-tight text-gray-700 dark:text-gray-200"
    >
      {provisional ? (
        <Link
          href={milestoneSettingsHref(milestone)}
          className="block rounded hover:bg-amber-50 dark:hover:bg-amber-900/30"
          title={`${MILESTONE_LABELS[milestone]} is not set; this date is a fallback. Set it in settings.`}
        >
          {label}
        </Link>
      ) : (
        label
      )}
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
        unset; their Tasks and windows sit on fallback dates. Set one and its
        unapproved Tasks move to the real date on their own — approved,
        scheduled and published Tasks stay where they are:
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
        {shown.map((message) => (
          <li key={message}>{message}</li>
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
