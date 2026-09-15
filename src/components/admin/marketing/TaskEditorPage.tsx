'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon,
  PaintBrushIcon,
  PaperAirplaneIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import { ModalShell } from '@/components/ModalShell'
import { ConnectedVariantEditor } from '@/components/admin/social/ConnectedVariantEditor'
import { ManualPostView } from '@/components/admin/social/ManualPostView'
import { taggedUrl } from '@/lib/marketing/link'
import { sitePathIssue, type PagePickerOption } from '@/lib/marketing/pages'
import {
  MARKETING_CHANNEL_LABELS,
  TASK_KIND_LABELS,
  type TaskEditorData,
  type TaskView,
} from '@/lib/marketing/types'
import { SOCIAL_PLATFORM_LABELS } from '@/lib/social/types'
import {
  formatDateTimeSafe,
  instantToOsloLocalInput,
  osloLocalInputToIso,
} from '@/lib/time'
import { api } from '@/lib/trpc/client'
import {
  isWaiting,
  MILESTONE_LABELS,
  milestoneSettingsHref,
  STATUS_LABELS,
} from './timeline-model'

const inputClass =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'

const CUSTOM = '__custom__'

/**
 * The full-page Task editor (spec §7, #1012). The header edits what every
 * Kind shares — assignee, date, Prerequisites — and the body is the Kind's
 * tool: the single-variant editor with the page picker and the approve
 * button for a post, a tick for a checklist or event-page update, a pointer
 * to the studio for a render. Every write goes through `marketing.task.*`
 * (or `social.*` for the variant) and the page reloads its read model after.
 */
export function TaskEditorPage({ taskId }: { taskId: string }) {
  const query = api.marketing.task.get.useQuery(
    { taskId },
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
          <p className="font-medium">The Task cannot be shown.</p>
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
  // Keyed on the Task id, not its revision: an assignee or date change
  // must not remount the page and drop an unsaved post body.
  return <LoadedTaskEditor key={query.data.task._id} data={query.data} />
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

function LoadedTaskEditor({ data }: { data: TaskEditorData }) {
  const { task, campaign } = data
  const router = useRouter()
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const [deleting, setDeleting] = useState(false)

  const refresh = () => {
    void utils.marketing.task.get.invalidate({ taskId: task._id })
    void utils.marketing.plan.get.invalidate()
  }
  const failed = (title: string) => (err: { message: string }) =>
    showNotification({ type: 'error', title, message: err.message })

  const del = api.marketing.task.delete.useMutation({
    onSuccess: () => {
      void utils.marketing.plan.get.invalidate()
      void utils.social.listVariants.invalidate()
      showNotification({ type: 'success', title: 'Task deleted' })
      router.push('/admin/marketing')
    },
    onError: (err) => {
      setDeleting(false)
      failed('Could not delete')(err)
    },
  })

  const kindLine = `${TASK_KIND_LABELS[task.kind]}${
    task.channel ? ` · ${MARKETING_CHANNEL_LABELS[task.channel]}` : ''
  }`

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<ClipboardDocumentCheckIcon />}
        title={task.title}
        description={
          <>
            <span className="font-medium text-gray-700 dark:text-gray-200">
              {campaign.title}
            </span>
            {' · '}
            {kindLine}
            {' · '}
            <StatusBadge task={task} />
          </>
        }
        backLink={{ href: '/admin/marketing', label: 'Marketing plan' }}
      />

      {task.provisional && (
        <p className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
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

      <TaskMeta data={data} onChanged={refresh} onFailed={failed} />

      {task.kind === 'publishing' ? (
        <PublishingSection data={data} onChanged={refresh} onFailed={failed} />
      ) : task.kind === 'checklist' || task.kind === 'eventPageUpdate' ? (
        <TickSection data={data} onChanged={refresh} onFailed={failed} />
      ) : task.kind === 'studioRender' ? (
        <StudioSection data={data} />
      ) : (
        <OutreachSection data={data} onChanged={refresh} onFailed={failed} />
      )}

      <div className="flex justify-end">
        <AdminButton
          color="red"
          variant="secondary"
          size="md"
          onClick={() => setDeleting(true)}
        >
          <TrashIcon className="mr-1 size-4" />
          Delete task
        </AdminButton>
      </div>

      <ConfirmationModal
        isOpen={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => del.mutate({ taskId: task._id })}
        title="Delete this task?"
        message={
          task.kind === 'publishing'
            ? 'The task, its post and its platform variant are removed. A post that is going out or has gone out cannot be deleted.'
            : 'The task is removed from the plan. Tasks that listed it as a prerequisite no longer wait on it.'
        }
        confirmButtonText="Delete task"
        variant="danger"
        isLoading={del.isPending}
      />
    </div>
  )
}

const BADGE_TONE: Record<TaskView['status'], string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  publishing:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  'awaiting-manual':
    'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  published:
    'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
  open: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  done: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
  skipped: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

function StatusBadge({ task }: { task: TaskView }) {
  return (
    <span
      data-status={task.status}
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        BADGE_TONE[task.status],
      )}
    >
      {STATUS_LABELS[task.status]}
    </span>
  )
}

type Handlers = {
  onChanged: () => void
  onFailed: (title: string) => (err: { message: string }) => void
}

/** What every Kind shares: assignee, date, Prerequisites, approval. */
function TaskMeta({
  data,
  onChanged,
  onFailed,
}: { data: TaskEditorData } & Handlers) {
  const { task, siblings, organizers } = data
  const byId = useMemo(
    () => new Map([...siblings, task].map((t) => [t._id, t])),
    [siblings, task],
  )
  const [dateInput, setDateInput] = useState(() =>
    instantToOsloLocalInput(task.date ?? undefined),
  )
  const setAssignee = api.marketing.task.setAssignee.useMutation({
    onSuccess: onChanged,
    onError: onFailed('Could not change the assignee'),
  })
  const setDate = api.marketing.task.setDate.useMutation({
    onSuccess: onChanged,
    onError: onFailed('Could not move the task'),
  })
  const setPrerequisites = api.marketing.task.setPrerequisites.useMutation({
    onSuccess: onChanged,
    onError: onFailed('Could not change the prerequisites'),
  })
  const dateIso = osloLocalInputToIso(dateInput)
  const dateChanged = dateIso !== null && dateIso !== task.date
  const retimable =
    task.kind !== 'publishing' ||
    ['draft', 'scheduled', 'failed'].includes(task.status)
  const busy =
    setAssignee.isPending || setDate.isPending || setPrerequisites.isPending

  return (
    <section
      aria-label="Task details"
      className="grid gap-5 rounded-xl border border-gray-200 bg-white p-4 text-sm md:grid-cols-3 dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="min-w-0">
        <label
          htmlFor="task-assignee"
          className="block text-xs font-medium text-gray-500 dark:text-gray-400"
        >
          Assignee
        </label>
        <select
          id="task-assignee"
          value={task.assigneeId ?? ''}
          disabled={busy}
          onChange={(e) =>
            e.target.value &&
            setAssignee.mutate({ taskId: task._id, assigneeId: e.target.value })
          }
          className={clsx(inputClass, 'mt-1')}
        >
          {!task.assigneeId && <option value="">Unassigned</option>}
          {task.assigneeId &&
            !organizers.some((o) => o._id === task.assigneeId) && (
              <option value={task.assigneeId}>
                {task.assigneeName ?? 'Former organizer'}
              </option>
            )}
          {organizers.map((o) => (
            <option key={o._id} value={o._id}>
              {o.name}
              {o._id === data.planOwnerId ? ' (plan owner)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-0">
        <label
          htmlFor="task-date"
          className="block text-xs font-medium text-gray-500 dark:text-gray-400"
        >
          {task.kind === 'publishing' ? 'Scheduled for' : 'Due'}
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="task-date"
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
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {!retimable
            ? 'A post that is going out keeps its time.'
            : task.milestone
              ? `Anchored to ${MILESTONE_LABELS[task.milestone]}; moving it by hand un-anchors it.`
              : 'Moved by hand; no longer follows a Milestone.'}
        </p>
      </div>

      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Approval
        </p>
        <p className="mt-1 text-gray-900 dark:text-gray-100">
          {task.approvedAt ? (
            <>
              <CheckCircleIcon className="mr-1 inline size-4 text-green-600" />
              Approved by {task.approvedByName ?? 'an organizer'} ·{' '}
              {formatDateTimeSafe(task.approvedAt)}
            </>
          ) : (
            'Not yet approved.'
          )}
        </p>
      </div>

      <fieldset className="md:col-span-3">
        <legend className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Prerequisites · same campaign · shown as waiting, never enforced
        </legend>
        {siblings.length === 0 ? (
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            No other task in this campaign.
          </p>
        ) : (
          <ul className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {siblings.map((s) => {
              const checked = task.prerequisiteIds.includes(s._id)
              return (
                <li key={s._id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() =>
                        setPrerequisites.mutate({
                          taskId: task._id,
                          prerequisiteIds: checked
                            ? task.prerequisiteIds.filter((id) => id !== s._id)
                            : [...task.prerequisiteIds, s._id],
                        })
                      }
                      className="size-4 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
                    />
                    <span className="min-w-0 truncate text-gray-900 dark:text-gray-100">
                      {s.title}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {s.complete ? '✓' : STATUS_LABELS[s.status]}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {isWaiting(task, byId) && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Waiting on an open prerequisite. The task can still be approved.
          </p>
        )}
      </fieldset>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Publishing: page picker, derived link, the variant editor, approve
// ---------------------------------------------------------------------------

function PublishingSection({
  data,
  onChanged,
  onFailed,
}: { data: TaskEditorData } & Handlers) {
  const { task, campaign, variant, pages, baseUrl } = data
  const [targetPage, setTargetPage] = useState(task.targetPage ?? '')
  // A path the picker does not list is a custom one; the choice sticks
  // even while the typed path happens to equal a listed page.
  const [custom, setCustom] = useState(
    () => !pages.some((p) => p.path === (task.targetPage ?? '')),
  )
  const [dirty, setDirty] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)

  const derived = useMemo(() => {
    const issue = sitePathIssue(targetPage)
    if (issue || !task.channel) return { link: null, issue }
    try {
      return {
        link: taggedUrl({
          baseUrl,
          targetPage,
          channel: task.channel,
          campaignKey: campaign.key,
          taskKey: task.key,
        }),
        issue: null,
      }
    } catch (error) {
      return {
        link: null,
        issue: error instanceof Error ? error.message : 'Not a site path',
      }
    }
  }, [targetPage, task.channel, task.key, campaign.key, baseUrl])

  const approve = api.marketing.task.approve.useMutation({
    onSuccess: onChanged,
    onError: onFailed('Could not approve'),
  })
  const unschedule = api.social.unscheduleVariant.useMutation({
    onSuccess: onChanged,
    onError: onFailed('Could not pull the post back'),
  })
  const retry = api.social.scheduleVariant.useMutation({
    onSuccess: onChanged,
    onError: onFailed('Could not retry'),
  })
  const markPosted = api.social.markPosted.useMutation({
    onSuccess: onChanged,
    onError: (err) => setManualError(err.message),
  })

  if (!variant) {
    return (
      <Panel title="Post">
        <p className="text-sm text-red-700 dark:text-red-300">
          This task has no post variant. It cannot be edited or approved.
        </p>
      </Panel>
    )
  }
  const v = variant.variant
  const platform = SOCIAL_PLATFORM_LABELS[v.platform]

  if (v.status === 'awaiting-manual') {
    return (
      <Panel title={`Post by hand on ${platform}`}>
        <ManualPostView
          variant={v}
          postAttachments={variant.post.attachments}
          saving={markPosted.isPending}
          error={manualError}
          onMarkPosted={(url) => {
            setManualError(null)
            markPosted.mutate({ variantId: v._id, url })
          }}
        />
      </Panel>
    )
  }

  if (v.status === 'published' || v.status === 'publishing') {
    return (
      <Panel title="Post">
        <p className="text-sm text-gray-700 dark:text-gray-200">
          {v.status === 'publishing'
            ? 'Being published right now.'
            : 'Published.'}{' '}
          {v.publishResult?.url && (
            <a
              href={v.publishResult.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand-cloud-blue underline underline-offset-2"
            >
              Open on {platform}
              <ArrowTopRightOnSquareIcon className="size-3.5" />
            </a>
          )}
        </p>
        <pre className="mt-3 rounded-md bg-gray-50 p-3 text-sm whitespace-pre-wrap text-gray-800 dark:bg-gray-800 dark:text-gray-100">
          {v.body}
        </pre>
      </Panel>
    )
  }

  const pageKey = custom
    ? CUSTOM
    : (pages.find((p) => p.path === targetPage)?.key ?? CUSTOM)

  return (
    <Panel
      title={`${platform} post`}
      aside={
        <ApproveControls
          status={v.status}
          dirty={dirty}
          busy={approve.isPending || unschedule.isPending || retry.isPending}
          scheduledAt={v.scheduledAt}
          onApprove={() => approve.mutate({ taskId: task._id })}
          onUnschedule={() => unschedule.mutate({ variantId: v._id })}
          onRetry={() => retry.mutate({ variantId: v._id })}
        />
      }
    >
      <PagePicker
        pages={pages}
        pageKey={pageKey}
        targetPage={targetPage}
        issue={derived.issue}
        link={derived.link}
        onChange={(next, isCustom) => {
          setCustom(isCustom)
          setTargetPage(next)
          setDirty(true)
        }}
      />
      <div className="mt-5">
        <ConnectedVariantEditor
          // A save or an approval bumps the variant's revision; the form is
          // rebuilt from the saved state so the next save compare-and-sets
          // on it rather than reporting "changed underneath".
          key={v._rev}
          data={variant}
          onDirtyChange={setDirty}
          onSaved={onChanged}
          task={{
            taskId: task._id,
            targetPage: derived.link ? targetPage : null,
            taggedLink: derived.link,
          }}
        />
      </div>
    </Panel>
  )
}

function ApproveControls({
  status,
  dirty,
  busy,
  scheduledAt,
  onApprove,
  onUnschedule,
  onRetry,
}: {
  status: TaskView['status']
  dirty: boolean
  busy: boolean
  scheduledAt: string | null
  onApprove: () => void
  onUnschedule: () => void
  onRetry: () => void
}) {
  if (status === 'draft') {
    return (
      <div className="text-right">
        <AdminButton
          color="green"
          size="md"
          disabled={busy || dirty}
          onClick={onApprove}
        >
          <CheckCircleIcon className="mr-1 size-4" />
          Approve
        </AdminButton>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {dirty
            ? 'Save your changes first.'
            : scheduledAt
              ? `Queues it for ${formatDateTimeSafe(scheduledAt)}.`
              : 'Set a time first.'}
        </p>
      </div>
    )
  }
  if (status === 'scheduled') {
    return (
      <div className="text-right">
        <AdminButton
          color="blue"
          variant="secondary"
          size="md"
          disabled={busy}
          onClick={onUnschedule}
        >
          Pull back to draft
        </AdminButton>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Approved
          {scheduledAt ? ` · goes out ${formatDateTimeSafe(scheduledAt)}` : ''}
        </p>
      </div>
    )
  }
  if (status === 'failed') {
    return (
      <div className="text-right">
        <AdminButton color="orange" size="md" disabled={busy} onClick={onRetry}>
          Retry
        </AdminButton>
        <p className="mt-1 text-xs text-red-700 dark:text-red-300">
          The last publish failed.
        </p>
      </div>
    )
  }
  return null
}

function PagePicker({
  pages,
  pageKey,
  targetPage,
  issue,
  link,
  onChange,
}: {
  pages: PagePickerOption[]
  pageKey: string
  targetPage: string
  issue: string | null
  link: string | null
  onChange: (path: string, custom: boolean) => void
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label
          htmlFor="task-page"
          className="block text-sm font-medium text-gray-700 dark:text-gray-200"
        >
          Target page
        </label>
        <select
          id="task-page"
          value={pageKey}
          onChange={(e) => {
            const picked = pages.find((p) => p.key === e.target.value)
            if (picked) onChange(picked.path, false)
            else onChange('', true)
          }}
          className={clsx(inputClass, 'mt-1')}
        >
          {pages.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label} · {p.path}
            </option>
          ))}
          <option value={CUSTOM}>Custom path…</option>
        </select>
        {pageKey === CUSTOM && (
          <input
            aria-label="Custom path"
            type="text"
            value={targetPage}
            placeholder="/some/page"
            onChange={(e) => onChange(e.target.value, true)}
            aria-invalid={issue !== null}
            className={clsx(inputClass, 'mt-2')}
          />
        )}
        {issue && (
          <p
            role="alert"
            className="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {issue}
          </p>
        )}
      </div>
      <div>
        <p className="block text-sm font-medium text-gray-700 dark:text-gray-200">
          Tagged link
        </p>
        <p
          data-testid="tagged-link"
          className="mt-1 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs break-all text-gray-700 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-200"
        >
          {link ?? '—'}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Written into the post when you save; the campaign and task tags are
          what the report attributes visits to.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Checklist / event-page update: instructions, tick done, skip with reason
// ---------------------------------------------------------------------------

function TickSection({
  data,
  onChanged,
  onFailed,
}: { data: TaskEditorData } & Handlers) {
  const { task } = data
  const [externalUrl, setExternalUrl] = useState(task.externalUrl ?? '')
  const [skipping, setSkipping] = useState(false)
  const [reason, setReason] = useState('')
  const complete = api.marketing.task.complete.useMutation({
    onSuccess: onChanged,
    onError: onFailed('Could not mark done'),
  })
  const skip = api.marketing.task.skip.useMutation({
    onSuccess: () => {
      setSkipping(false)
      onChanged()
    },
    onError: onFailed('Could not skip'),
  })
  const busy = complete.isPending || skip.isPending
  const isEvent = task.kind === 'eventPageUpdate'

  return (
    <Panel
      title={TASK_KIND_LABELS[task.kind]}
      aside={
        task.status === 'open' ? (
          <div className="flex gap-2">
            <AdminButton
              color="green"
              size="md"
              disabled={busy}
              onClick={() =>
                complete.mutate({
                  taskId: task._id,
                  ...(isEvent && externalUrl.trim()
                    ? { externalUrl: externalUrl.trim() }
                    : {}),
                })
              }
            >
              <CheckCircleIcon className="mr-1 size-4" />
              Mark done
            </AdminButton>
            <AdminButton
              color="blue"
              variant="secondary"
              size="md"
              disabled={busy}
              onClick={() => setSkipping(true)}
            >
              Skip…
            </AdminButton>
          </div>
        ) : null
      }
    >
      {task.instructions ? (
        <p className="text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-100">
          {task.instructions}
        </p>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No instructions on this task.
        </p>
      )}
      {isEvent && (
        <div className="mt-4 max-w-xl">
          <label
            htmlFor="task-external-url"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Page or listing URL (optional)
          </label>
          <input
            id="task-external-url"
            type="url"
            value={externalUrl}
            disabled={task.status !== 'open'}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="https://…"
            className={clsx(inputClass, 'mt-1')}
          />
          {task.status !== 'open' && task.externalUrl && (
            <a
              href={task.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-brand-cloud-blue underline underline-offset-2"
            >
              Open
              <ArrowTopRightOnSquareIcon className="size-3" />
            </a>
          )}
        </div>
      )}
      {task.status === 'done' && (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-green-700 dark:text-green-300">
          <CheckCircleIcon className="size-4" />
          Done.
        </p>
      )}
      {task.status === 'skipped' && (
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          Skipped{task.skipReason ? `: ${task.skipReason}` : '.'}
        </p>
      )}

      <ModalShell
        isOpen={skipping}
        onClose={() => setSkipping(false)}
        size="md"
        title="Skip this task?"
        subtitle="Say why, so the plan reads right later"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (reason.trim())
              skip.mutate({ taskId: task._id, reason: reason.trim() })
          }}
          className="space-y-3"
        >
          <label htmlFor="task-skip-reason" className="sr-only">
            Reason
          </label>
          <textarea
            id="task-skip-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Not needed this edition because…"
            className={inputClass}
          />
          <div className="flex justify-end gap-2">
            <AdminButton
              color="blue"
              variant="secondary"
              size="sm"
              onClick={() => setSkipping(false)}
              disabled={skip.isPending}
            >
              Cancel
            </AdminButton>
            <AdminButton
              color="blue"
              size="sm"
              type="submit"
              disabled={!reason.trim() || skip.isPending}
            >
              Skip task
            </AdminButton>
          </div>
        </form>
      </ModalShell>
    </Panel>
  )
}

function StudioSection({ data }: { data: TaskEditorData }) {
  const { task } = data
  return (
    <Panel
      title="Studio render"
      aside={
        <Link
          href="/admin/marketing/studio"
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <PaintBrushIcon className="mr-1 size-4" />
          Open the promo studio
        </Link>
      }
    >
      {task.assetUrl ? (
        <div>
          <p className="mb-2 text-sm text-green-700 dark:text-green-300">
            Rendered; the image is attached to this task.
          </p>
          <img
            src={task.assetUrl}
            alt=""
            className="max-h-64 rounded-md border border-gray-200 dark:border-gray-700"
          />
        </div>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Render the image in the studio
          {task.subject ? ` for ${task.subject.name}` : ''}. Attaching the
          render to the task from the studio is a later step; the task is
          complete once an image is attached.
        </p>
      )}
    </Panel>
  )
}

function OutreachSection({ data }: { data: TaskEditorData } & Handlers) {
  const { task } = data
  return (
    <Panel title={TASK_KIND_LABELS[task.kind]}>
      <p className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
        <PaperAirplaneIcon className="mt-0.5 size-4 shrink-0" />
        <span>
          {task.subject
            ? `Reach out to ${task.subject.name}. `
            : 'Reach out to the subject. '}
          The prefilled message composer is a later step; this task completes
          when the message is sent through the messaging system.
        </span>
      </p>
      {task.instructions && (
        <p className="mt-3 text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-100">
          {task.instructions}
        </p>
      )}
    </Panel>
  )
}

function Panel({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}
