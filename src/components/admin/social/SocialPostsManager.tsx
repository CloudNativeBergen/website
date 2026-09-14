'use client'

import { useState } from 'react'
import clsx from 'clsx'
import {
  MegaphoneIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { ModalShell } from '@/components/ModalShell'
import { EmptyState } from '@/components/EmptyState'
import { api } from '@/lib/trpc/client'
import { VariantEditorDialog } from './VariantEditorDialog'
import { ManualPostDialog } from './ManualPostDialog'
import {
  formatDateTimeSafe,
  instantToOsloLocalInput,
  osloLocalInputToIso,
} from '@/lib/time'
import {
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
  type SocialPostVariantListItem,
  type VariantStatus,
} from '@/lib/social/types'

const STATUS_STYLES: Record<
  VariantStatus,
  { label: string; className: string }
> = {
  draft: {
    label: 'Draft',
    className:
      'bg-gray-100 text-gray-700 ring-gray-500/20 dark:bg-gray-800 dark:text-gray-300',
  },
  scheduled: {
    label: 'Scheduled',
    className:
      'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-300',
  },
  publishing: {
    label: 'Publishing',
    className:
      'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-900/30 dark:text-indigo-300',
  },
  'awaiting-manual': {
    label: 'Post by hand',
    className:
      'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-300',
  },
  published: {
    label: 'Published',
    className:
      'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/30 dark:text-green-300',
  },
  failed: {
    label: 'Failed',
    className:
      'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/30 dark:text-red-300',
  },
}

function StatusPill({ status }: { status: VariantStatus }) {
  const style = STATUS_STYLES[status]
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        style.className,
      )}
    >
      {style.label}
    </span>
  )
}

interface PostDraft {
  body: string
  /** `datetime-local` value in Europe/Oslo wall-clock. */
  defaultScheduledAt: string
  platforms: SocialPlatform[]
}

const EMPTY_DRAFT: PostDraft = {
  body: '',
  defaultScheduledAt: '',
  platforms: ['linkedin', 'bluesky'],
}

/**
 * The posting core's minimal organizer surface (#1004): every variant of the
 * conference with its status and the state-machine actions an organizer may
 * take. The full composer and variant editor arrive with spec §9 step 2.
 */
export function SocialPostsManager({
  defaultOpen = false,
  defaultEditId = null,
  defaultManualId = null,
  onManualClosed,
}: {
  /** Opens the create form on mount — for stories/visual capture. */
  defaultOpen?: boolean
  /** Opens the variant editor on mount — for stories/visual capture. */
  defaultEditId?: string | null
  /**
   * Opens the copy-ready view on mount: the `?variant=` deep link the
   * awaiting-manual notification carries (#1006), and stories.
   */
  defaultManualId?: string | null
  /**
   * Called when the copy-ready view closes; the page clears `?variant=`
   * here so the same hub link can be followed again.
   */
  onManualClosed?: () => void
}) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  // The cron moves variants on its own schedule; poll so the organizer can
  // watch a scheduled variant become "post by hand" without reloading.
  const { data: variants, isLoading } = api.social.listVariants.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  )

  const [isFormOpen, setFormOpen] = useState(defaultOpen)
  const [draft, setDraft] = useState<PostDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [scheduleTarget, setScheduleTarget] =
    useState<SocialPostVariantListItem | null>(null)
  const [scheduleTime, setScheduleTime] = useState('')
  /** Follow the post's default time instead of a per-variant override. */
  const [followDefault, setFollowDefault] = useState(true)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [manualTarget, setManualTarget] = useState<string | null>(
    defaultManualId,
  )
  // A hub click while already on this page only changes the query string;
  // follow it rather than opening the view once on mount (state adjusted
  // during render on a prop change, the React-sanctioned form).
  const [followedDeepLink, setFollowedDeepLink] = useState(defaultManualId)
  if (defaultManualId !== followedDeepLink) {
    setFollowedDeepLink(defaultManualId)
    if (defaultManualId) setManualTarget(defaultManualId)
  }
  const [deleteTarget, setDeleteTarget] =
    useState<SocialPostVariantListItem | null>(null)
  const [editTarget, setEditTarget] = useState<string | null>(defaultEditId)

  const invalidate = () => void utils.social.listVariants.invalidate()
  const createPost = api.social.createPost.useMutation({
    onSuccess: () => {
      invalidate()
      setFormOpen(false)
      setDraft(EMPTY_DRAFT)
      setError(null)
      showNotification({
        type: 'success',
        title: 'Post created',
        message: 'One draft variant per platform is ready to schedule.',
      })
    },
    onError: (err) => setError(err.message || 'Failed to create the post.'),
  })
  const schedule = api.social.scheduleVariant.useMutation({
    onSuccess: () => {
      invalidate()
      setScheduleTarget(null)
    },
    onError: (err) => setScheduleError(err.message || 'Could not schedule.'),
  })
  const unschedule = api.social.unscheduleVariant.useMutation({
    onSuccess: invalidate,
    onError: (err) =>
      showNotification({
        type: 'error',
        title: 'Could not unschedule',
        message: err.message || 'Something went wrong.',
      }),
  })
  const deletePost = api.social.deletePost.useMutation({
    onSuccess: () => {
      invalidate()
      setDeleteTarget(null)
    },
    onError: (err) => {
      setDeleteTarget(null)
      showNotification({
        type: 'error',
        title: 'Could not delete',
        message: err.message || 'Something went wrong.',
      })
    },
  })

  const openSchedule = (variant: SocialPostVariantListItem) => {
    setScheduleTarget(variant)
    const hasDefault = variant.postDefaultScheduledAt !== null
    setFollowDefault(hasDefault && !variant.usesCustomTime)
    setScheduleTime(
      instantToOsloLocalInput(
        (variant.usesCustomTime
          ? variant.scheduledAt
          : (variant.postDefaultScheduledAt ?? variant.scheduledAt)) ??
          undefined,
      ),
    )
    setScheduleError(null)
  }
  const handleSchedule = (event: React.FormEvent) => {
    event.preventDefault()
    if (!scheduleTarget) return
    setScheduleError(null)
    // Following the post default sends no time: the server re-attaches the
    // variant to it. Anything else is an explicit per-variant override.
    if (followDefault && scheduleTarget.postDefaultScheduledAt) {
      schedule.mutate({ variantId: scheduleTarget._id })
      return
    }
    const iso = osloLocalInputToIso(scheduleTime)
    if (!iso) {
      setScheduleError('Pick a date and time.')
      return
    }
    schedule.mutate({ variantId: scheduleTarget._id, scheduledAt: iso })
  }

  const isBusy =
    schedule.isPending || unschedule.isPending || deletePost.isPending

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    const body = draft.body.trim()
    if (!body) {
      setError('Write the post body first.')
      return
    }
    if (draft.platforms.length === 0) {
      setError('Pick at least one platform.')
      return
    }
    const defaultScheduledAt = osloLocalInputToIso(draft.defaultScheduledAt)
    if (draft.defaultScheduledAt && !defaultScheduledAt) {
      setError('The default time is not a valid date and time.')
      return
    }
    createPost.mutate({ body, defaultScheduledAt, platforms: draft.platforms })
  }

  const togglePlatform = (platform: SocialPlatform) =>
    setDraft((p) => ({
      ...p,
      platforms: p.platforms.includes(platform)
        ? p.platforms.filter((x) => x !== platform)
        : [...p.platforms, platform],
    }))

  const rows = variants ?? []
  // Delete is per POST: hide the control on every row of a post that has a
  // published or in-flight variant, since the server would refuse it.
  const undeletablePosts = new Set(
    rows
      .filter((v) => v.status === 'published' || v.status === 'publishing')
      .map((v) => v.postId),
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Social posts"
        description="Schedule per-platform variants; the publish cron picks them up every minute."
        icon={<MegaphoneIcon className="size-6" />}
        backLink={{ href: '/admin/marketing', label: 'Marketing' }}
        actions={
          <AdminButton color="blue" size="md" onClick={() => setFormOpen(true)}>
            <PlusIcon className="mr-1 size-4" />
            New post
          </AdminButton>
        }
      />

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MegaphoneIcon}
          title="No posts yet"
          description="Create a post to get one draft variant per platform."
          className="rounded-lg bg-gray-50 p-8 dark:bg-gray-800"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className={thClass}>Post</th>
                <th className={thClass}>Platform</th>
                <th className={thClass}>Status</th>
                <th className={clsx(thClass, 'hidden md:table-cell')}>
                  Scheduled
                </th>
                <th className={clsx(thClass, 'text-right')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {rows.map((variant) => (
                <VariantRow
                  key={variant._id}
                  variant={variant}
                  disabled={isBusy}
                  onSchedule={() => openSchedule(variant)}
                  onUnschedule={() =>
                    unschedule.mutate({ variantId: variant._id })
                  }
                  onMarkPosted={() => setManualTarget(variant._id)}
                  onEdit={() => setEditTarget(variant._id)}
                  canDelete={!undeletablePosts.has(variant.postId)}
                  onDelete={() => setDeleteTarget(variant)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalShell
        isOpen={isFormOpen}
        onClose={() => {
          setFormOpen(false)
          setError(null)
        }}
        size="lg"
        title="New post"
        subtitle="One draft variant is created per platform"
        icon={<MegaphoneIcon className="size-5" />}
        confirmOnDirtyClose
        isDirty={draft.body.trim().length > 0 && !createPost.isPending}
      >
        <form noValidate onSubmit={handleCreate} className="space-y-4">
          <Field label="Body" htmlFor="social-body" required>
            <textarea
              id="social-body"
              rows={5}
              value={draft.body}
              onChange={(e) =>
                setDraft((p) => ({ ...p, body: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Default time (Oslo)" htmlFor="social-time">
            <input
              id="social-time"
              type="datetime-local"
              value={draft.defaultScheduledAt}
              onChange={(e) =>
                setDraft((p) => ({ ...p, defaultScheduledAt: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Platforms
            </legend>
            <div className="flex flex-wrap gap-2">
              {SOCIAL_PLATFORMS.map((platform) => {
                const checked = draft.platforms.includes(platform)
                return (
                  <label
                    key={platform}
                    className={clsx(
                      'inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm',
                      checked
                        ? 'border-brand-cloud-blue bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100'
                        : 'border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePlatform(platform)}
                      className="size-4 rounded border-gray-300"
                    />
                    {SOCIAL_PLATFORM_LABELS[platform]}
                  </label>
                )
              })}
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <AdminButton
              type="button"
              variant="secondary"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              color="brand"
              disabled={createPost.isPending}
            >
              {createPost.isPending ? 'Creating…' : 'Create post'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>

      <VariantEditorDialog
        variantId={editTarget}
        onClose={() => setEditTarget(null)}
      />

      <ManualPostDialog
        variantId={manualTarget}
        onClose={() => {
          setManualTarget(null)
          onManualClosed?.()
        }}
        onPosted={invalidate}
      />

      <ConfirmationModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() =>
          deleteTarget && deletePost.mutate({ postId: deleteTarget.postId })
        }
        title="Delete this post?"
        message="The post and every one of its platform variants are removed. A post with a published variant cannot be deleted."
        confirmButtonText="Delete post"
        variant="danger"
        isLoading={deletePost.isPending}
      />

      <ModalShell
        isOpen={scheduleTarget !== null}
        onClose={() => setScheduleTarget(null)}
        size="md"
        title={scheduleTarget?.status === 'failed' ? 'Retry' : 'Schedule'}
        subtitle={
          scheduleTarget
            ? `${SOCIAL_PLATFORM_LABELS[scheduleTarget.platform]} · the cron publishes at this time`
            : undefined
        }
        icon={<MegaphoneIcon className="size-5" />}
      >
        <form noValidate onSubmit={handleSchedule} className="space-y-4">
          {scheduleTarget?.postDefaultScheduledAt && (
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={followDefault}
                onChange={(e) => setFollowDefault(e.target.checked)}
                className="size-4 rounded border-gray-300"
              />
              Follow the post&apos;s default time (
              {formatDateTimeSafe(scheduleTarget.postDefaultScheduledAt)})
            </label>
          )}
          {!(followDefault && scheduleTarget?.postDefaultScheduledAt) && (
            <Field
              label="Publish at (Oslo)"
              htmlFor="social-schedule-time"
              required
            >
              <input
                id="social-schedule-time"
                type="datetime-local"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}
          {scheduleError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {scheduleError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <AdminButton
              type="button"
              variant="secondary"
              onClick={() => setScheduleTarget(null)}
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              color="brand"
              disabled={schedule.isPending}
            >
              {schedule.isPending ? 'Scheduling…' : 'Schedule'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>
    </div>
  )
}

/** Content is editable until the cron takes the variant (mirrors the router). */
const EDITABLE = new Set<VariantStatus>(['draft', 'scheduled', 'failed'])

/** Only web URLs are rendered as links; anything else is shown as text. */
function isWebUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function VariantRow({
  variant,
  disabled,
  onSchedule,
  onUnschedule,
  onMarkPosted,
  onEdit,
  canDelete,
  onDelete,
}: {
  variant: SocialPostVariantListItem
  disabled: boolean
  onSchedule: () => void
  onUnschedule: () => void
  onMarkPosted: () => void
  onEdit: () => void
  canDelete: boolean
  onDelete: () => void
}) {
  const lastAttempt = variant.attempts.at(-1)
  return (
    <tr>
      <td className="max-w-md px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
        <p className="line-clamp-2">{variant.body}</p>
        {variant.status === 'failed' && lastAttempt?.error && (
          <p className="mt-1 line-clamp-2 text-xs text-red-600 dark:text-red-400">
            {lastAttempt.error}
          </p>
        )}
        {variant.status === 'published' &&
          variant.publishResult?.url &&
          (isWebUrl(variant.publishResult.url) ? (
            <a
              href={variant.publishResult.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-xs text-brand-cloud-blue hover:underline"
            >
              {variant.publishResult.url}
            </a>
          ) : (
            <p className="mt-1 truncate text-xs text-gray-500">
              {variant.publishResult.url}
            </p>
          ))}
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap text-gray-700 dark:text-gray-300">
        {SOCIAL_PLATFORM_LABELS[variant.platform]}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <StatusPill status={variant.status} />
      </td>
      <td className="hidden px-4 py-3 text-sm whitespace-nowrap text-gray-700 md:table-cell dark:text-gray-300">
        {variant.scheduledAt ? (
          <>
            <time dateTime={variant.scheduledAt}>
              {formatDateTimeSafe(variant.scheduledAt)}
            </time>
            {variant.usesCustomTime && (
              <span className="ml-1 text-xs text-gray-500">(custom)</span>
            )}
          </>
        ) : (
          <span className="text-gray-400">No time set</span>
        )}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1">
          {EDITABLE.has(variant.status) && (
            <button
              type="button"
              onClick={onEdit}
              disabled={disabled}
              aria-label="Edit variant"
              title="Edit body, images, link and time"
              className="inline-flex size-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <PencilSquareIcon className="size-5" />
            </button>
          )}
          <VariantActions
            status={variant.status}
            disabled={disabled}
            onSchedule={onSchedule}
            onUnschedule={onUnschedule}
            onMarkPosted={onMarkPosted}
          />
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={disabled}
              aria-label="Delete post"
              title="Delete the post and all its variants"
              className="inline-flex size-11 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <TrashIcon className="size-5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

/**
 * The organizer actions per state: (re-)schedule a draft or failed variant,
 * pull a scheduled one back, open the copy-ready view for an awaiting-manual
 * one. Publishing
 * and published rows have nothing to do here.
 */
function VariantActions({
  status,
  disabled,
  onSchedule,
  onUnschedule,
  onMarkPosted,
}: {
  status: VariantStatus
  disabled: boolean
  onSchedule: () => void
  onUnschedule: () => void
  onMarkPosted: () => void
}) {
  switch (status) {
    case 'draft':
    case 'failed':
      return (
        <AdminButton
          size="xs"
          color="brand"
          disabled={disabled}
          onClick={onSchedule}
        >
          {status === 'failed' ? 'Retry' : 'Schedule'}
        </AdminButton>
      )
    case 'awaiting-manual':
      return (
        <AdminButton
          size="xs"
          color="orange"
          disabled={disabled}
          onClick={onMarkPosted}
        >
          Post by hand
        </AdminButton>
      )
    case 'scheduled':
      return (
        <AdminButton
          size="xs"
          variant="secondary"
          disabled={disabled}
          onClick={onUnschedule}
        >
          Unschedule
        </AdminButton>
      )
    case 'publishing':
    case 'published':
      return null
  }
}

const thClass =
  'px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400'

const inputClass =
  'block min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white'

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
      >
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}
