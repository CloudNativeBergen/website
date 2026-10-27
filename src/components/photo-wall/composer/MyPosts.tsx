'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  CheckCircleIcon,
  ClockIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'
import {
  MY_POST_STATUS_LABELS,
  type MyPost,
  type MyPostDeletionStatus,
  type MyPostMarketingStatus,
} from '@/lib/photo-wall/my-posts'
import type { WallPostStatus } from '@/lib/photo-wall/moderation'
import { focusIsWith } from '../focus'

/** One of this phone's posts as the list shows it. */
export interface MyPostView extends MyPost {
  /**
   * CSS `object-position` for a photo that is not yet Sanity's `rect=`
   * square: the JPEG this phone just sent, shown until the server lists the
   * post (`WallPoster`).
   */
  objectPosition?: string
}

/**
 * An action's answer, and how many My posts reads had started when it came.
 * A list from a later read ({@link MyPostsProps.listRead} above it) was
 * read after the action and is the authority on the card again.
 */
export interface CardAnswer<Status> {
  status: Status
  readsBefore: number
}

export interface MyPostsProps {
  posts: MyPostView[]
  /** Which My posts read `posts` came from: reads are numbered from 1. */
  listRead: number
  /** Delete, after the confirm: the `deleteMyPost` Server Action's answer. */
  onDelete: (post: MyPost) => Promise<CardAnswer<MyPostDeletionStatus>>
  /** The Marketing switch: the `setMyPostMarketing` Server Action's answer. */
  onMarketing: (
    post: MyPost,
    consent: boolean,
  ) => Promise<CardAnswer<MyPostMarketingStatus>>
}

/** The inline confirm's question (Photo Wall spec §12). */
export const DELETE_CONFIRM_MESSAGE =
  'Delete this photo? It’s removed from the wall and can’t be undone.'

const DELETE_FAILED_MESSAGE = MY_POST_STATUS_LABELS.deleting
const MARKETING_FAILED_MESSAGE = 'Couldn’t change. Try again.'

/**
 * My posts (Photo Wall spec §6.5, §12): each of this phone's posts, newest
 * first, as a polaroid with its status (Waiting for approval, On the wall,
 * Not shown), the Marketing switch and Delete behind an inline confirm. A
 * `deleting` post says "Couldn't delete. Try again." with Delete still
 * offered. Photos are plain `<img>` elements of their Sanity URLs, never
 * `next/image` (§5.1). The caller reads the list again after each action.
 */
export function MyPosts({
  posts,
  listRead,
  onDelete,
  onMarketing,
}: MyPostsProps) {
  return (
    <ul className="mx-auto max-w-xs space-y-8">
      {posts.map((post) => (
        <MyPostCard
          key={post._id}
          post={post}
          listRead={listRead}
          onDelete={onDelete}
          onMarketing={onMarketing}
        />
      ))}
    </ul>
  )
}

const STATUS_ICONS: Record<
  Exclude<WallPostStatus, 'deleting'>,
  typeof ClockIcon
> = {
  pending: ClockIcon,
  approved: CheckCircleIcon,
  notShown: EyeSlashIcon,
}

const STATUS_CLASSES: Record<Exclude<WallPostStatus, 'deleting'>, string> = {
  pending: 'text-amber-800',
  approved: 'text-green-800',
  notShown: 'text-gray-500',
}

const BUTTON =
  'inline-flex min-h-10 items-center justify-center rounded-md px-3 font-sans text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait aria-disabled:opacity-60'
const DANGER = `${BUTTON} bg-red-700 text-white hover:bg-red-800`
const DANGER_QUIET = `${BUTTON} bg-white text-red-700 ring-1 ring-red-300 ring-inset hover:bg-red-50`
const SECONDARY = `${BUTTON} bg-white text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-50`

/**
 * My posts as a section of its own: the heading and the list. The open
 * composer puts it under the landing; the closed page under See the wall.
 */
export function MyPostsSection(props: MyPostsProps) {
  return (
    <section aria-labelledby="my-posts" className="mt-10">
      <h2
        id="my-posts"
        className="font-display text-xl font-semibold text-gray-900 dark:text-gray-100"
      >
        My posts
      </h2>
      <div className="mt-6">
        <MyPosts {...props} />
      </div>
    </section>
  )
}

/** What a card can be doing, or have failed at. */
type CardAction = 'delete' | 'marketing'

function MyPostCard({
  post,
  listRead,
  onDelete,
  onMarketing,
}: { post: MyPostView } & Omit<MyPostsProps, 'posts'>) {
  const { src, objectPosition, caption, name, status } = post
  const [busy, setBusy] = useState<CardAction | null>(null)
  const [failed, setFailed] = useState<CardAction | null>(null)
  const [confirming, setConfirming] = useState(false)
  // What an action answered, each shown until a list read AFTER that answer
  // comes in: from then on the list is the authority (a later read that
  // still lists a "deleted" post shows it again; another tab may have
  // changed the consent). By read, never by value: a value can come back.
  const [removed, setRemoved] = useState<number | null>(null)
  const [changed, setChanged] = useState<{
    consent: boolean
    readsBefore: number
  } | null>(null)
  const consent =
    changed && listRead <= changed.readsBefore ? changed.consent : null

  const confirmId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const groupRef = useRef<HTMLLIElement>(null)
  // The pressed button leaves the page as the confirm replaces it, and
  // back: focus follows, to Cancel (never the destructive choice) and to
  // Delete.
  const toggled = useRef(false)
  useEffect(() => {
    if (!toggled.current) return
    toggled.current = false
    ;(confirming ? cancelRef : deleteRef).current?.focus()
  }, [confirming])
  const confirm = (on: boolean, handBack = true) => {
    toggled.current = handBack
    setConfirming(on)
  }

  const remove = async () => {
    if (busy) return
    setBusy('delete')
    setFailed(null)
    const answer = await onDelete(post).catch(() => null)
    setBusy(null)
    if (!answer || answer.status === 'failed') {
      setFailed('delete')
      confirm(false, focusIsWith(groupRef.current))
    } else {
      setRemoved(answer.readsBefore)
      // Closed without a hand-back: should a later list show it again, it
      // shows as it was before the confirm.
      confirm(false, false)
    }
  }

  const toggleMarketing = async () => {
    if (busy) return
    const next = !(consent ?? post.marketingConsent)
    setBusy('marketing')
    setFailed(null)
    const answer = await onMarketing(post, next).catch(() => null)
    setBusy(null)
    if (answer?.status === 'done') {
      setChanged({ consent: next, readsBefore: answer.readsBefore })
    } else {
      setFailed('marketing')
    }
  }

  if (removed !== null && listRead <= removed) return null
  const deleting = status === 'deleting'
  const Icon = deleting ? null : STATUS_ICONS[status]

  return (
    <li
      ref={groupRef}
      aria-label={caption ?? undefined}
      className="bg-white p-3 pb-2 text-left text-gray-900 shadow-lg ring-1 ring-black/5"
    >
      {src ? (
        <img
          src={src}
          alt={caption ? `Your photo: ${caption}` : 'Your photo'}
          width={600}
          height={600}
          decoding="async"
          className="block aspect-square w-full bg-gray-200 object-cover"
          style={objectPosition ? { objectPosition } : undefined}
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex aspect-square w-full items-center justify-center bg-gray-100"
        />
      )}
      <div className="font-caveat">
        {caption && (
          <p className="mt-2 text-2xl leading-tight font-medium break-words">
            {caption}
          </p>
        )}
        {name && (
          <p className="text-right text-xl font-medium text-gray-500">
            — {name}
          </p>
        )}
      </div>
      <p
        className={`mt-2 flex items-center gap-1.5 border-t border-gray-100 pt-2 font-sans text-sm font-medium ${deleting ? 'text-red-700' : STATUS_CLASSES[status]}`}
      >
        {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
        {MY_POST_STATUS_LABELS[status]}
      </p>
      {status === 'notShown' && (
        <p className="mt-1 font-sans text-xs text-gray-500">
          An organizer chose not to show this photo on the wall. You can still
          delete it; if you don’t, it’s deleted with every other post 30 days
          after the conference.
        </p>
      )}

      {confirming ? (
        <div
          role="group"
          aria-labelledby={confirmId}
          className="mt-2 space-y-2 rounded-md border border-red-200 bg-red-50 p-3"
        >
          <p
            id={confirmId}
            className="font-sans text-sm font-medium text-red-800"
          >
            {DELETE_CONFIRM_MESSAGE}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              // Named apart from the Delete that opened the confirm.
              aria-label={busy === 'delete' ? undefined : 'Delete this photo'}
              aria-disabled={busy !== null || undefined}
              onClick={remove}
              className={DANGER}
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
            <button
              type="button"
              ref={cancelRef}
              aria-disabled={busy !== null || undefined}
              onClick={() => !busy && confirm(false)}
              className={SECONDARY}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {/* A deleting post already says "Couldn't delete. Try again." */}
          {failed === 'delete' && !deleting && (
            <p role="alert" className="font-sans text-sm text-red-700">
              {DELETE_FAILED_MESSAGE}
            </p>
          )}
          {failed === 'marketing' && (
            <p role="alert" className="font-sans text-sm text-red-700">
              {MARKETING_FAILED_MESSAGE}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {!deleting && (
              <MarketingSwitch
                checked={consent ?? post.marketingConsent}
                busy={busy === 'marketing'}
                disabled={busy !== null}
                onToggle={toggleMarketing}
              />
            )}
            <button
              type="button"
              ref={deleteRef}
              aria-disabled={busy !== null || undefined}
              onClick={() => !busy && confirm(true)}
              className={`${DANGER_QUIET} ml-auto`}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * The Marketing switch (§12): "The organizers may also use my photo in
 * their own marketing", on or off, changed with one press.
 */
function MarketingSwitch({
  checked,
  busy,
  disabled,
  onToggle,
}: {
  checked: boolean
  busy: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const id = useId()
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          id={id}
          aria-checked={checked}
          aria-disabled={disabled || undefined}
          aria-describedby={`${id}-help`}
          onClick={() => !disabled && onToggle()}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:opacity-60 ${checked ? 'bg-brand-cloud-blue' : 'bg-gray-300'}`}
        >
          <span className="sr-only">Marketing</span>
          <span
            aria-hidden="true"
            className={`inline-block size-5 rounded-full bg-white shadow-xs transition-transform ${checked ? 'translate-x-5.5' : 'translate-x-0.5'}`}
          />
        </button>
        <label htmlFor={id} className="font-sans text-sm text-gray-700">
          {busy ? 'Saving…' : 'Marketing'}
        </label>
      </span>
      <span
        id={`${id}-help`}
        className="max-w-48 font-sans text-xs text-gray-500"
      >
        On: the organizers may also use this photo in their own marketing. Turn
        it off at any time.
      </span>
    </span>
  )
}
