'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { CheckBadgeIcon } from '@heroicons/react/24/solid'
import { PhotoIcon } from '@heroicons/react/24/outline'
import {
  allowsFrom,
  cropOutline,
  type ModerationPhoto,
  type ModerationPost,
  type WallPostCrop,
} from '@/lib/photo-wall'
import { formatConferenceDayTime } from '@/lib/time'
import { focusIsWith } from '../focus'

/** What an organizer can do to a post from its card (§10, §12). */
export type PostAction =
  'approve' | 'reject' | 'remove' | 'withdrawMarketing' | 'delete'

/** The actions that ask first, inline. */
type Confirmed = Extract<PostAction, 'withdrawMarketing' | 'delete'>

/**
 * How an action ended: written (`done`), someone else decided first
 * (`changed`), the post no longer exists (`gone`), or it did not go through
 * (`failed`: the card says so, and the organizer can press again).
 */
export type PostActionOutcome = 'done' | 'changed' | 'gone' | 'failed'

export interface WallPostCardProps {
  post: ModerationPost
  /**
   * Runs an action; without it the card has no actions (read only). Answers
   * null when the post already has one in flight: the press is ignored.
   */
  onAction?: (
    post: ModerationPost,
    action: PostAction,
  ) => Promise<PostActionOutcome | null>
  /** The action in flight on this post, held by the queue across remounts. */
  busy?: PostAction | null
  /** The last action that failed on it, held by the queue likewise. */
  failed?: PostAction | null
}

/**
 * One Wall Post on `/admin/photo-wall` (Photo Wall spec §10): the whole
 * photo with the square the wall shows outlined, the caption, the name, when
 * it was submitted, and the Marketing OK mark. A `deleting` post has no photo
 * and says the delete did not finish (§12). Its actions follow its status.
 */
export function WallPostCard({
  post,
  onAction,
  busy = null,
  failed = null,
}: WallPostCardProps) {
  return (
    // Named by its caption; without one the photo's "Photo by …" says who,
    // and the card does not repeat it.
    <article
      aria-label={post.caption ?? undefined}
      className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    >
      {post.photo ? (
        <Photo photo={post.photo} crop={post.crop} name={post.name} />
      ) : (
        <NoPhoto />
      )}
      <div className="space-y-1.5 p-3 sm:p-4">
        {post.status === 'deleting' && (
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            Couldn’t delete. Try again.
          </p>
        )}
        {post.caption && (
          <p
            dir="auto"
            className="text-sm wrap-anywhere text-gray-900 dark:text-white"
          >
            {post.caption}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
          {post.name && (
            <span
              dir="auto"
              className="font-medium wrap-anywhere text-gray-900 dark:text-gray-200"
            >
              {post.name}
            </span>
          )}
          {post.submittedAt && (
            <time dateTime={post.submittedAt}>
              {formatConferenceDayTime(post.submittedAt)}
            </time>
          )}
          {post.marketingConsent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-800 ring-1 ring-green-600/20 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-400/30">
              <CheckBadgeIcon className="size-3.5" aria-hidden="true" />
              Marketing OK
            </span>
          )}
        </p>
        {onAction && (
          <Actions
            post={post}
            onAction={onAction}
            busy={busy}
            failed={failed}
          />
        )}
      </div>
    </article>
  )
}

/**
 * The actions a status offers: the decisions its transitions allow (§10),
 * and Delete, which every status allows; a `deleting` post only that, as
 * Try again.
 */
const actionsFor = (status: ModerationPost['status']): PostAction[] => [
  ...(['approve', 'reject', 'remove'] as const).filter((action) =>
    allowsFrom(action, status),
  ),
  'delete',
]

/**
 * Withdraw marketing OK, on its own quiet line, while the post has the mark
 * (never the other way: only the contributor gives consent, §12), and not on
 * a `deleting` post.
 */
const offersWithdraw = (post: ModerationPost) =>
  post.marketingConsent && post.status !== 'deleting'

const LABELS: Record<
  PostAction,
  { idle: string; busy: string; failed: string }
> = {
  approve: {
    idle: 'Approve',
    busy: 'Approving…',
    failed: 'Couldn’t approve. Try again.',
  },
  reject: {
    idle: 'Reject',
    busy: 'Rejecting…',
    failed: 'Couldn’t reject. Try again.',
  },
  remove: {
    idle: 'Remove',
    busy: 'Removing…',
    failed: 'Couldn’t remove. Try again.',
  },
  withdrawMarketing: {
    idle: 'Withdraw marketing OK',
    busy: 'Withdrawing…',
    failed: 'Couldn’t withdraw marketing OK. Try again.',
  },
  delete: {
    idle: 'Delete now',
    busy: 'Deleting…',
    failed: 'Couldn’t delete. Try again.',
  },
}

const BUTTON =
  'inline-flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-semibold shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait aria-disabled:opacity-60 dark:focus-visible:outline-indigo-400'
const PRIMARY = `${BUTTON} bg-green-700 text-white hover:bg-green-800`
const SECONDARY = `${BUTTON} bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50 ring-inset dark:bg-gray-700 dark:text-white dark:ring-gray-500 dark:hover:bg-gray-600`
const DANGER = `${BUTTON} bg-red-700 text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500`
const QUIET =
  'inline-flex min-h-10 items-center rounded-md text-sm font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait aria-disabled:opacity-60 dark:text-gray-300 dark:hover:text-white dark:focus-visible:outline-indigo-400'
const DANGER_QUIET = `${BUTTON} bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50 ring-inset dark:bg-gray-800 dark:text-red-400 dark:ring-red-500/60 dark:hover:bg-red-950`

/** What each inline confirm asks, and how it looks. */
const CONFIRMS: Record<
  Confirmed,
  { question: string; confirm: string; box: string; text: string }
> = {
  delete: {
    question: 'Delete this photo for good? It can’t be undone.',
    confirm: 'Delete',
    box: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40',
    text: 'text-red-800 dark:text-red-300',
  },
  // Only the contributor can give consent again, from their phone (§12).
  withdrawMarketing: {
    question:
      'Withdraw marketing OK? The photo leaves the marketing export. Only the contributor can give it again.',
    confirm: 'Withdraw',
    box: 'border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-900/40',
    text: 'text-gray-900 dark:text-white',
  },
}

function Actions({
  post,
  onAction,
  busy,
  failed,
}: {
  post: ModerationPost
  onAction: NonNullable<WallPostCardProps['onAction']>
  busy: PostAction | null
  failed: PostAction | null
}) {
  const [confirming, setConfirming] = useState<Confirmed | null>(null)
  const confirmId = useId()
  // The pressed button leaves the page as the confirm replaces it, and back:
  // focus follows, to Cancel (never the irreversible choice) and to the
  // button that asked.
  const cancelRef = useRef<HTMLButtonElement>(null)
  const askedRefs = useRef<Partial<Record<Confirmed, HTMLButtonElement>>>({})
  const groupRef = useRef<HTMLDivElement>(null)
  // The button to hand focus back to on the next render, if any.
  const handBackTo = useRef<Confirmed | 'cancel' | null>(null)
  useEffect(() => {
    const to = handBackTo.current
    if (!to) return
    handBackTo.current = null
    ;(to === 'cancel' ? cancelRef.current : askedRefs.current[to])?.focus()
  }, [confirming])
  const ask = (action: Confirmed) => {
    handBackTo.current = 'cancel'
    setConfirming(action)
  }
  const close = (handBack = true) => {
    handBackTo.current = handBack ? confirming : null
    setConfirming(null)
  }

  const run = async (action: PostAction) => {
    // Not `disabled`, which drops focus: a press while busy does nothing.
    if (busy) return
    const outcome = await onAction(post, action).catch(
      (): PostActionOutcome => 'failed',
    )
    // Ignored: already in flight, held by the queue.
    if (outcome === null) return
    // Focus goes back to the button that asked only if it is still in the
    // confirm: the organizer may have moved on while the answer was on its
    // way.
    if (confirming) close(focusIsWith(groupRef.current))
  }

  const deleting = post.status === 'deleting'
  if (confirming) {
    const copy = CONFIRMS[confirming]
    return (
      <div
        ref={groupRef}
        role="group"
        aria-labelledby={confirmId}
        className={`mt-2 space-y-2 rounded-md border p-3 ${copy.box}`}
      >
        <p id={confirmId} className={`text-sm font-medium ${copy.text}`}>
          {copy.question}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-disabled={busy !== null || undefined}
            onClick={() => run(confirming)}
            className={DANGER}
          >
            {busy === confirming ? LABELS[confirming].busy : copy.confirm}
          </button>
          <button
            type="button"
            aria-disabled={busy !== null || undefined}
            ref={cancelRef}
            onClick={() => !busy && close()}
            className={SECONDARY}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 pt-2">
      {/* A deleting post already says "Couldn't delete. Try again." */}
      {failed && !(deleting && failed === 'delete') && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {LABELS[failed].failed}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {actionsFor(post.status).map((action) => {
          const label =
            busy === action
              ? LABELS[action].busy
              : deleting
                ? 'Try again'
                : LABELS[action].idle
          return (
            <button
              key={action}
              ref={
                action === 'delete'
                  ? (node) => {
                      askedRefs.current.delete = node ?? undefined
                    }
                  : undefined
              }
              type="button"
              aria-disabled={busy !== null || undefined}
              onClick={() =>
                // Delete now asks first; Try again finishes a delete
                // already confirmed.
                action === 'delete' && !deleting
                  ? !busy && ask(action)
                  : run(action)
              }
              className={
                action === 'approve'
                  ? PRIMARY
                  : action === 'delete'
                    ? `${DANGER_QUIET} ${deleting ? '' : 'ml-auto'}`
                    : SECONDARY
              }
            >
              {label}
            </button>
          )
        })}
      </div>
      {offersWithdraw(post) && (
        <button
          ref={(node) => {
            askedRefs.current.withdrawMarketing = node ?? undefined
          }}
          type="button"
          aria-disabled={busy !== null || undefined}
          onClick={() => !busy && ask('withdrawMarketing')}
          className={QUIET}
        >
          {busy === 'withdrawMarketing'
            ? LABELS.withdrawMarketing.busy
            : LABELS.withdrawMarketing.idle}
        </button>
      )}
    </div>
  )
}

const pct = (fraction: number) => `${fraction * 100}%`

/** A tall photo is shown no taller than this share of the viewport. */
const MAX_PHOTO_VH = 70

/**
 * The whole photo as a plain `<img>` of its Sanity URL (§5.1): never
 * `next/image`, whose optimizer would keep serving a deleted photo. The inner
 * box IS the rendered photo: its aspect ratio reserved before the photo
 * loads, its width capped so a tall portrait stays within
 * {@link MAX_PHOTO_VH}vh. The outline, in percentages of that box, sits on
 * the photo whatever its shape; a thin panorama sits centred in a frame of
 * at least 8rem.
 */
function Photo({
  photo,
  crop,
  name,
}: {
  photo: ModerationPhoto
  crop: WallPostCrop
  name: string | null
}) {
  const box = cropOutline(photo, crop)
  return (
    <div className="flex min-h-32 items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div
        data-testid="photo-box"
        className="relative overflow-hidden"
        style={{
          aspectRatio: `${photo.width} / ${photo.height}`,
          width: `min(100%, ${MAX_PHOTO_VH}vh * ${photo.width / photo.height})`,
        }}
      >
        <img
          src={photo.url}
          alt={name ? `Photo by ${name}` : 'Posted photo'}
          width={photo.width}
          height={photo.height}
          loading="lazy"
          decoding="async"
          className="block size-full object-contain"
        />
        {/* The square the wall shows; what lies outside it is dimmed. */}
        <div
          data-testid="crop-outline"
          aria-hidden="true"
          className="pointer-events-none absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] outline-2 -outline-offset-2 outline-white/90"
          style={{
            left: pct(box.left),
            top: pct(box.top),
            width: pct(box.width),
            height: pct(box.height),
          }}
        />
      </div>
    </div>
  )
}

function NoPhoto() {
  return (
    <div className="flex aspect-4/3 items-center justify-center bg-gray-100 text-gray-400 dark:bg-gray-900 dark:text-gray-600">
      <PhotoIcon className="size-10" aria-hidden="true" />
      <span className="sr-only">No photo</span>
    </div>
  )
}
