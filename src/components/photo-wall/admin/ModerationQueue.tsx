'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import {
  MODERATION_TABS,
  MODERATION_TAB_LABELS,
  postsInTab,
  tabOf,
  type ModerationQueue as Queue,
  type ModerationTab,
} from '@/lib/photo-wall'
import { api } from '@/lib/trpc/client'
import { moderationQueuePolling } from './polling'
import { WallPostCard } from './WallPostCard'

/**
 * The moderation queue on `/admin/photo-wall` (Photo Wall spec §8, §10):
 * `photoWall.moderationQueue`, polled every 10 s while the page is visible
 * and never stopped for idleness, in the tabs Pending, On the wall and Not
 * shown. Read side only: the actions are slice M4b.
 */
export function ModerationQueue() {
  const queue = api.photoWall.moderationQueue.useQuery(
    undefined,
    moderationQueuePolling,
  )
  return (
    <ModerationQueueView
      queue={queue.data}
      loading={queue.isPending}
      failed={queue.isError}
    />
  )
}

export interface ModerationQueueViewProps {
  queue?: Queue
  /** The first read is on its way. */
  loading?: boolean
  /** The last read failed; with `queue`, the one before it is still shown. */
  failed?: boolean
}

const EMPTY: Record<ModerationTab, string> = {
  pending:
    'Nothing waiting. New posts show up here within about ten seconds of being posted.',
  onTheWall: 'Nothing on the wall yet. Approve a pending post to show it.',
  notShown: 'Nothing here. Rejected and removed posts end up here.',
}

export function ModerationQueueView({
  queue,
  loading = false,
  failed = false,
}: ModerationQueueViewProps) {
  const [tab, setTab] = useState<ModerationTab>('pending')
  const base = useId()
  const tabId = (t: ModerationTab) => `${base}-tab-${t}`
  const panelId = `${base}-panel`
  const tabRefs = useRef<Partial<Record<ModerationTab, HTMLButtonElement>>>({})

  const counts = Object.fromEntries(
    MODERATION_TABS.map((t) => [t, 0]),
  ) as Record<ModerationTab, number>
  for (const post of queue?.posts ?? []) counts[tabOf(post.status)] += 1
  const posts = queue ? postsInTab(queue.posts, tab) : []

  /** Arrow keys, Home and End move between the tabs and select (WAI-ARIA). */
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const at = MODERATION_TABS.indexOf(tab)
    const last = MODERATION_TABS.length - 1
    const next =
      event.key === 'ArrowRight'
        ? at === last
          ? 0
          : at + 1
        : event.key === 'ArrowLeft'
          ? at === 0
            ? last
            : at - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    const target = MODERATION_TABS[next]
    setTab(target)
    tabRefs.current[target]?.focus()
  }

  const status = queue
    ? queue.pendingCount === 0
      ? 'Nothing waiting for approval'
      : `${queue.pendingCount} waiting for approval`
    : loading
      ? 'Loading posts…'
      : ''

  return (
    <section aria-labelledby={`${base}-title`} className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id={`${base}-title`}
          className="text-base font-semibold text-gray-900 dark:text-white"
        >
          Posts
        </h2>
        {/* The live pending count (§10): polite, so each poll that changes
            it is announced without interrupting. */}
        <p
          role="status"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {status}
        </p>
      </div>
      {failed && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
        >
          {queue
            ? 'Couldn’t refresh. Trying again…'
            : 'Couldn’t load the posts. Trying again…'}
        </p>
      )}
      <div
        role="tablist"
        aria-label="Posts by status"
        className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-gray-900"
      >
        {MODERATION_TABS.map((t) => {
          const selected = t === tab
          return (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[t] = el ?? undefined
              }}
              type="button"
              role="tab"
              id={tabId(t)}
              aria-selected={selected}
              aria-controls={panelId}
              aria-label={`${MODERATION_TAB_LABELS[t]} (${counts[t]})`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={onKeyDown}
              className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue sm:gap-1.5 sm:px-3 sm:text-sm dark:focus-visible:outline-indigo-400 ${
                selected
                  ? 'bg-white text-gray-900 shadow-xs ring-1 ring-gray-300 dark:bg-gray-700 dark:text-white dark:ring-gray-500'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {MODERATION_TAB_LABELS[t]}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                  selected
                    ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                    : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                {counts[t]}
              </span>
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)}>
        {!queue && loading ? (
          <Skeleton />
        ) : posts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-600 dark:text-gray-400">
            {EMPTY[tab]}
          </p>
        ) : (
          <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {posts.map((post) => (
              <WallPostCard key={post._id} post={post} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function Skeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="aspect-[4/3] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
        />
      ))}
    </div>
  )
}
