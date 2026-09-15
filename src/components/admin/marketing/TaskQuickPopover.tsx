'use client'

import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import {
  MARKETING_CHANNEL_LABELS,
  TASK_KIND_LABELS,
  type TaskView,
} from '@/lib/marketing/types'
import {
  formatDateTimeSafe,
  instantToOsloLocalInput,
  osloLocalInputToIso,
} from '@/lib/time'
import { api } from '@/lib/trpc/client'
import {
  MILESTONE_LABELS,
  milestoneSettingsHref,
  STATUS_LABELS,
  type ChipTone,
} from './timeline-model'
import { useCeilingWarningToast } from './useCeilingWarningToast'

const inputClass =
  'block w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 shadow-xs focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'

/** Approve applies to a draft post, or an open non-publishing Task not yet approved. */
export function canApprove(task: TaskView): boolean {
  return task.kind === 'publishing'
    ? task.status === 'draft'
    : task.status === 'open' && !task.approvedAt
}

/**
 * The quick popover on a timeline chip (spec §7): assignee, date, approve,
 * and the way to the full editor. Every write invalidates the plan so the
 * chip moves (draft → scheduled) without a reload.
 */
export function TaskQuickPopover({
  task,
  byId,
  tone,
  waiting,
  campaignTitle,
  onDone,
}: {
  task: TaskView
  byId: Map<string, TaskView>
  tone: ChipTone
  waiting: boolean
  campaignTitle: string
  /** Called after a successful write, to close the popover. */
  onDone?: () => void
}) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const warnCeilings = useCeilingWarningToast()
  const organizers = api.sponsor.crm.listOrganizers.useQuery()
  const [dateInput, setDateInput] = useState(() =>
    instantToOsloLocalInput(task.date ?? undefined),
  )
  // Follow the document when its date changes underneath (a colleague's
  // move, a cron re-queue), so "Move" never silently reverts it.
  const [dateBase, setDateBase] = useState(task.date)
  if (task.date !== dateBase) {
    setDateBase(task.date)
    setDateInput(instantToOsloLocalInput(task.date ?? undefined))
  }
  const refresh = () => {
    void utils.marketing.plan.get.invalidate()
    void utils.marketing.task.get.invalidate({ taskId: task._id })
  }
  const failed = (title: string) => (err: { message: string }) =>
    showNotification({ type: 'error', title, message: err.message })
  const setAssignee = api.marketing.task.setAssignee.useMutation({
    onSuccess: refresh,
    onError: failed('Could not change the assignee'),
  })
  const setDate = api.marketing.task.setDate.useMutation({
    onSuccess: (result) => {
      refresh()
      warnCeilings(result)
    },
    onError: failed('Could not move the task'),
  })
  const approve = api.marketing.task.approve.useMutation({
    onSuccess: (result) => {
      refresh()
      showNotification({ type: 'success', title: 'Approved' })
      warnCeilings(result)
      onDone?.()
    },
    onError: failed('Could not approve'),
  })
  const busy = setAssignee.isPending || setDate.isPending || approve.isPending
  const dateIso = osloLocalInputToIso(dateInput)
  const dateChanged = dateIso !== null && dateIso !== task.date
  const retimable =
    task.kind !== 'publishing' ||
    ['draft', 'scheduled', 'failed'].includes(task.status)
  const prerequisites = task.prerequisiteIds
    .map((id) => byId.get(id))
    .filter((t): t is TaskView => t !== undefined)

  return (
    <div
      data-testid="task-quick-popover"
      className="w-80 space-y-3 rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-900"
    >
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {campaignTitle}
        </p>
        <p className="font-semibold text-gray-900 dark:text-white">
          {task.title}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          {TASK_KIND_LABELS[task.kind]}
          {task.channel ? ` · ${MARKETING_CHANNEL_LABELS[task.channel]}` : ''}
          {' · '}
          {STATUS_LABELS[task.status]}
          {tone === 'overdue' && !task.complete ? ' · overdue' : ''}
        </p>
      </div>

      {task.provisional && (
        <p className="flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200">
          <ExclamationTriangleIcon className="size-3.5 text-amber-500" />
          Provisional:{' '}
          {task.milestone ? MILESTONE_LABELS[task.milestone] : 'Milestone'}{' '}
          unset.{' '}
          <Link
            href={milestoneSettingsHref(task.milestone)}
            className="underline underline-offset-2"
          >
            Set it
          </Link>
        </p>
      )}

      <div>
        <label
          htmlFor={`assignee-${task._id}`}
          className="block text-xs text-gray-500 dark:text-gray-400"
        >
          Assignee
        </label>
        <select
          id={`assignee-${task._id}`}
          value={task.assigneeId ?? ''}
          disabled={busy || organizers.isLoading}
          onChange={(e) =>
            e.target.value &&
            setAssignee.mutate({ taskId: task._id, assigneeId: e.target.value })
          }
          className={clsx(inputClass, 'mt-0.5')}
        >
          {(!task.assigneeId ||
            !(organizers.data ?? []).some(
              (o) => o._id === task.assigneeId,
            )) && (
            <option value={task.assigneeId ?? ''}>
              {task.assigneeId ? 'Former organizer' : 'Unassigned'}
            </option>
          )}
          {(organizers.data ?? []).map((o) => (
            <option key={o._id} value={o._id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor={`date-${task._id}`}
          className="block text-xs text-gray-500 dark:text-gray-400"
        >
          {task.kind === 'publishing' ? 'Scheduled for' : 'Due'}
        </label>
        <div className="mt-0.5 flex gap-1.5">
          <input
            id={`date-${task._id}`}
            type="datetime-local"
            value={dateInput}
            disabled={busy || !retimable}
            onChange={(e) => setDateInput(e.target.value)}
            className={clsx(inputClass, 'min-w-0 flex-1')}
          />
          <AdminButton
            color="blue"
            size="sm"
            disabled={!dateChanged || busy || !retimable}
            onClick={() =>
              dateIso && setDate.mutate({ taskId: task._id, at: dateIso })
            }
          >
            Move
          </AdminButton>
        </div>
      </div>

      {prerequisites.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {prerequisites.map((p) => (
            <li key={p._id} className="flex items-center gap-1.5">
              {p.complete ? (
                <span className="text-green-600">✓</span>
              ) : (
                <ClockIcon className="size-3.5 text-gray-500" />
              )}
              <span className="min-w-0 truncate">{p.title}</span>
              <span className="shrink-0 text-gray-500">
                · {STATUS_LABELS[p.status]}
              </span>
            </li>
          ))}
          {waiting && (
            <li className="text-gray-500 dark:text-gray-400">
              Waiting: shown, never enforced.
            </li>
          )}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
        <Link
          href={`/admin/marketing/tasks/${task._id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-cloud-blue underline-offset-2 hover:underline"
        >
          Open editor
          <ArrowTopRightOnSquareIcon className="size-3" />
        </Link>
        {canApprove(task) ? (
          <AdminButton
            color="green"
            size="sm"
            disabled={busy}
            onClick={() => approve.mutate({ taskId: task._id })}
          >
            <CheckCircleIcon className="mr-1 size-3.5" />
            Approve
          </AdminButton>
        ) : task.approvedAt || task.status === 'scheduled' ? (
          <span className="text-xs text-green-700 dark:text-green-300">
            Approved
            {task.approvedAt ? ` · ${formatDateTimeSafe(task.approvedAt)}` : ''}
          </span>
        ) : null}
      </div>
    </div>
  )
}
