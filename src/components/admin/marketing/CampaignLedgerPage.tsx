'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import {
  ArrowPathIcon,
  ChartBarSquareIcon,
  CursorArrowRaysIcon,
  ExclamationTriangleIcon,
  FlagIcon,
  HeartIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { useNotification } from '@/components/admin/NotificationProvider'
import {
  MARKETING_CHANNEL_LABELS,
  OUTCOME_LABELS,
  TASK_KIND_LABELS,
  type CampaignLedgerView,
  type LedgerTaskNumbers,
  type TaskView,
} from '@/lib/marketing/types'
import { formatDateSafe, formatDateTimeSafe } from '@/lib/time'
import { api } from '@/lib/trpc/client'
import { STATUS_LABELS } from './timeline-model'
import { CampaignEditor, DeleteCampaignDialog } from './settings'
import { CreateTask } from './task-creation'
import { Th, Td, compactDue, formatCount } from './table-cells'

/**
 * The Campaign ledger (spec §7, #1018): did this Campaign work? The funnel
 * reads left to right — the people it reached, what they clicked, and the one
 * Outcome the Campaign is judged on against its Target — and the Task table
 * below shows which Task earned what.
 *
 * EVERY NUMBER IS A STORED READING, never a live query: the page shows which
 * day it covers and when it was taken, so a blank is visibly "not measured
 * yet" rather than "zero". Refresh re-runs the same engine the daily cron
 * runs, and is metered per conference.
 */
export function CampaignLedgerPage({ campaignId }: { campaignId: string }) {
  const query = api.marketing.campaign.get.useQuery(
    { campaignId },
    { refetchOnWindowFocus: false },
  )

  if (query.error) {
    return (
      <div className="space-y-4">
        <BackToPlan />
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
        >
          <p className="font-medium">The ledger cannot be shown.</p>
          <p className="mt-1">{query.error.message}</p>
        </div>
      </div>
    )
  }
  if (!query.data) {
    return (
      <div className="space-y-4">
        <BackToPlan />
        <div className="h-96 animate-pulse rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900" />
      </div>
    )
  }
  return <LoadedLedger data={query.data} />
}

function BackToPlan() {
  return (
    <Link
      href="/admin/marketing"
      className="text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
    >
      ← Marketing plan
    </Link>
  )
}

function LoadedLedger({ data }: { data: CampaignLedgerView }) {
  const { campaign, snapshot, tasks, organizers, previousEdition } = data
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  const numbersByTask = useMemo(
    () => new Map((snapshot?.perTask ?? []).map((row) => [row.taskId, row])),
    [snapshot],
  )
  const organizerNames = useMemo(
    () => new Map(organizers.map((o) => [o._id, o.name])),
    [organizers],
  )

  const refresh = api.marketing.refreshSnapshots.useMutation({
    onSuccess: (result) => {
      void utils.marketing.campaign.get.invalidate({ campaignId: campaign._id })
      showNotification({
        type: result.source.posthog === 'ok' ? 'success' : 'warning',
        title: `Ledger refreshed for ${result.date}`,
        message: result.notes.length
          ? result.notes.join(' · ')
          : `${result.written} campaign${result.written === 1 ? '' : 's'} updated.`,
      })
    },
    onError: (error) =>
      showNotification({
        type: 'error',
        title: 'Could not refresh',
        message: error.message,
      }),
  })

  return (
    <div className="space-y-6">
      <BackToPlan />
      <AdminPageHeader
        icon={<FlagIcon />}
        title={campaign.title}
        description={
          <>
            {formatDateSafe(campaign.startDate)} –{' '}
            {formatDateSafe(campaign.endDate)}
            <span className="mx-2 text-gray-300 dark:text-gray-600">·</span>
            Measured as{' '}
            <span className="font-medium text-gray-700 dark:text-gray-200">
              {OUTCOME_LABELS[campaign.primaryOutcome]}
            </span>
            {campaign.outcomeTargetPage ? (
              <>
                {' '}
                <span
                  title="The page this campaign is about. Slice 1 counts the whole campaign, not this page alone — the attribution query carries no page dimension."
                  className="underline decoration-dotted underline-offset-2"
                >
                  about{' '}
                  <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">
                    {campaign.outcomeTargetPage}
                  </code>
                </span>
              </>
            ) : null}
          </>
        }
        actionItems={[
          {
            label: 'Edit Campaign',
            onClick: () => setEditing(true),
            variant: 'secondary' as const,
          },
          {
            label: 'Delete Campaign',
            onClick: () => setDeleting(true),
            variant: 'secondary' as const,
          },
          {
            label: refresh.isPending ? 'Refreshing…' : 'Refresh',
            onClick: () => refresh.mutate(),
            icon: (
              <ArrowPathIcon
                className={clsx('size-4', refresh.isPending && 'animate-spin')}
              />
            ),
            variant: 'secondary' as const,
            disabled: refresh.isPending,
          },
        ]}
      />

      {editing && (
        <CampaignEditor
          campaignId={campaign._id}
          onClose={() => setEditing(false)}
        />
      )}
      {deleting && (
        <DeleteCampaignDialog
          campaignId={campaign._id}
          onClose={() => setDeleting(false)}
        />
      )}
      <Reading snapshot={snapshot} />

      <Funnel
        campaign={campaign}
        snapshot={snapshot}
        previousEdition={previousEdition}
      />

      <div className="flex justify-end">
        <CreateTask campaignId={campaign._id} milestones={data.milestones} />
      </div>

      <TaskTable
        tasks={tasks}
        numbersByTask={numbersByTask}
        organizerNames={organizerNames}
      />
    </div>
  )
}

/** Which day is on screen, and how much of it could be measured. */
function Reading({ snapshot }: { snapshot: CampaignLedgerView['snapshot'] }) {
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
        No reading has been taken for this campaign yet. The daily run records
        one every morning; refresh to take one now.
      </div>
    )
  }
  const unavailable = [
    snapshot.source.posthog === 'unavailable' ? 'site analytics' : null,
    snapshot.source.bluesky === 'unavailable' ? 'Bluesky engagement' : null,
  ].filter((source): source is string => source !== null)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
      <span>
        Covering{' '}
        <span className="font-medium text-gray-700 dark:text-gray-200">
          {formatDateSafe(snapshot.date)}
        </span>
        {snapshot.takenAt
          ? `, read ${formatDateTimeSafe(snapshot.takenAt)}`
          : ''}
      </span>
      {unavailable.length > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <ExclamationTriangleIcon className="size-3.5" />
          {unavailable.join(' and ')} could not be read
        </span>
      )}
      {/* Taken against a previous incarnation of this Campaign key — the plan
          was deleted and reseeded, or restored. The numbers are real history
          for the key, so they are shown; the per-Task rows are not, because
          the Tasks they measured are gone. */}
      {snapshot.measuredBeforeReseed && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <ExclamationTriangleIcon className="size-3.5" />
          measured under the previous plan, before this Campaign was recreated
        </span>
      )}
      {/* The Outcome was changed after this was measured. Its primary figure
          counted the OLD metric and is withheld, but the funnel and the
          per-Task rows are computed from the attributed window alone and are
          still true — which is why the reading is kept and labelled rather
          than dropped, which used to blank the whole page. */}
      {snapshot.measuredOutcome && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <ExclamationTriangleIcon className="size-3.5" />
          measured {OUTCOME_LABELS[snapshot.measuredOutcome]}, before the
          Outcome changed — tonight&rsquo;s run measures the new one
        </span>
      )}
      {/* The window moved after this was measured — a Milestone was set, or
          the window was edited. The figure is still true of the span it
          covered, so name the span rather than dropping a real number. */}
      {snapshot.measuredWindow && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <ExclamationTriangleIcon className="size-3.5" />
          measured over {formatDateSafe(
            snapshot.measuredWindow.startDate,
          )} – {formatDateSafe(snapshot.measuredWindow.endDate)}, before the
          window moved
        </span>
      )}
    </div>
  )
}

function Funnel({
  campaign,
  snapshot,
  previousEdition,
}: {
  campaign: CampaignLedgerView['campaign']
  snapshot: CampaignLedgerView['snapshot']
  previousEdition: CampaignLedgerView['previousEdition']
}) {
  const outcomeLabel = OUTCOME_LABELS[campaign.primaryOutcome]
  const value = snapshot?.primaryValue ?? null
  const progress =
    value !== null && campaign.target && campaign.target > 0
      ? Math.min(100, Math.round((value / campaign.target) * 100))
      : null

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        icon={<UsersIcon className="size-4" />}
        label="Visits"
        hint="Sessions that arrived through this campaign's links"
        value={snapshot?.secondary.attributedSessions ?? null}
      />
      <Stat
        icon={<CursorArrowRaysIcon className="size-4" />}
        label="Checkout clicks"
        hint="Clicks on to the ticket shop from those visits"
        value={snapshot?.secondary.checkoutClickThrough ?? null}
      />
      <Stat
        icon={<HeartIcon className="size-4" />}
        label="Bluesky"
        hint="Likes, reposts, replies and quotes on its posts"
        value={snapshot?.secondary.blueskyInteractions ?? null}
      />
      <div className="rounded-xl border border-brand-cloud-blue/30 bg-brand-cloud-blue/5 p-4 dark:border-blue-500/30 dark:bg-blue-900/10">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          <ChartBarSquareIcon className="size-4" />
          {outcomeLabel}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-space-grotesk text-3xl font-semibold text-gray-900 dark:text-white">
            {formatCount(value)}
          </span>
          {campaign.target !== null && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              of {campaign.target} target
            </span>
          )}
        </div>
        {progress !== null && (
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
            role="presentation"
          >
            <div
              className="h-full rounded-full bg-brand-cloud-blue"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {snapshot && !snapshot.primaryAttributed && (
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
            In window, <strong>not attributed</strong> — counted because the
            campaign was running, not because its links caused it.
          </p>
        )}
        {snapshot?.primaryAttributedValue !== null &&
          snapshot?.primaryAttributedValue !== undefined && (
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
              {snapshot.primaryAttributedValue} of them arrived through this
              campaign&apos;s links.
            </p>
          )}
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {previousEdition
            ? `Previous edition (${previousEdition.editionTitle}): ${formatCount(previousEdition.value)}`
            : 'Previous edition: no comparable reading yet'}
        </p>
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  hint,
  value,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  value: number | null
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
        {icon}
        {label}
      </div>
      <div className="font-space-grotesk mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
        {formatCount(value)}
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
    </div>
  )
}

function TaskTable({
  tasks,
  numbersByTask,
  organizerNames,
}: {
  tasks: TaskView[]
  numbersByTask: Map<string, LedgerTaskNumbers>
  organizerNames: Map<string, string>
}) {
  const ordered = useMemo(
    () => [...tasks].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
    [tasks],
  )

  if (ordered.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        This campaign has no tasks yet.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800/60">
          <tr>
            <Th>Task</Th>
            <Th>Kind</Th>
            <Th>Channel</Th>
            <Th>Due</Th>
            <Th>Assignee</Th>
            <Th>Status</Th>
            <Th align="right">Visits</Th>
            <Th
              align="right"
              title="Every tagged CTA click this task earned: CFP, sponsor and checkout together — a wider measure than the checkout-only figure above."
            >
              CTA clicks
            </Th>
            <Th align="right">Bluesky</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
          {ordered.map((task) => {
            const numbers = numbersByTask.get(task._id)
            return (
              <tr key={task._id}>
                <Td>
                  <Link
                    href={`/admin/marketing/tasks/${task._id}`}
                    className="font-medium text-brand-cloud-blue hover:underline dark:text-blue-300"
                  >
                    {task.title}
                  </Link>
                </Td>
                <Td>{TASK_KIND_LABELS[task.kind]}</Td>
                <Td>
                  {task.channel ? MARKETING_CHANNEL_LABELS[task.channel] : '—'}
                </Td>
                <Td>{compactDue(task.date)}</Td>
                <Td>
                  {(task.assigneeId && organizerNames.get(task.assigneeId)) ??
                    '—'}
                </Td>
                <Td>{STATUS_LABELS[task.status]}</Td>
                <Td align="right">{formatCount(numbers?.sessions ?? null)}</Td>
                <Td align="right">{formatCount(numbers?.clicks ?? null)}</Td>
                <Td align="right">
                  {formatCount(numbers?.blueskyInteractions ?? null)}
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
