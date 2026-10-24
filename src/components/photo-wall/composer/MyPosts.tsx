'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  CheckCircleIcon,
  ClockIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'
import { MY_POST_STATUS_LABELS, type MyPost } from '@/lib/photo-wall/my-posts'
import type { WallPostStatus } from '@/lib/photo-wall/moderation'
import { focusIsWith } from '../admin/focus'

/** One of this phone's posts as the list shows it. */
export interface MyPostView extends MyPost {
  /**
   * CSS `object-position` for a photo that is not yet Sanity's `rect=`
   * square: the JPEG this phone just sent, shown until the server lists the
   * post (`WallPoster`).
   */
  objectPosition?: string
}

export interface MyPostsProps {
  posts: MyPostView[]
  /** Delete, after the confirm: the `deleteMyPost` Server Action's answer. */
  onDelete: (post: MyPost) => Promise<'deleted' | 'failed' | 'gone'>
  /** The Marketing switch: the `setMyPostMarketing` Server Action's answer. */
  onMarketing: (
    post: MyPost,
    consent: boolean,
  ) => Promise<'done' | 'changed' | 'gone'>
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
export function MyPosts({ posts, onDelete, onMarketing }: MyPostsProps) {
  return (
    <ul className="mx-auto max-w-xs space-y-8">
      {posts.map((post) => (
        <MyPostCard
          key={post._id}
          post={post}
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

type Busy = 'delete' | 'marketing' | null

function MyPostCard({
  post,
  onDelete,
  onMarketing,
}: { post: MyPostView } & Pick<MyPostsProps, 'onDelete' | 'onMarketing'>) {
  const { src, objectPosition, caption, name, status } = post
  const [busy, setBusy] = useState<Busy>(null)
  const [failed, setFailed] = useState<Busy>(null)
  const [confirming, setConfirming] = useState(false)
  // Deleted (or gone): nothing to show until the list drops it.
  const [removed, setRemoved] = useState(false)
  // The consent the switch shows once a change went through, until the
  // list is read again and carries it.
  const [consent, setConsent] = useState<boolean | null>(null)
  useEffect(() => setConsent(null), [post.marketingConsent])

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
    const outcome = await onDelete(post).catch(() => 'failed' as const)
    setBusy(null)
    if (outcome === 'failed') {
      setFailed('delete')
      confirm(false, focusIsWith(groupRef.current))
    } else {
      setRemoved(true)
    }
  }

  const toggleMarketing = async () => {
    if (busy) return
    const next = !(consent ?? post.marketingConsent)
    setBusy('marketing')
    setFailed(null)
    const outcome = await onMarketing(post, next).catch(
      () => 'changed' as const,
    )
    setBusy(null)
    if (outcome === 'done') setConsent(next)
    else setFailed('marketing')
  }

  if (removed) return null
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
      <span id={`${id}-help`} className="sr-only">
        The organizers may also use my photo in their own marketing.
      </span>
    </span>
  )
}
