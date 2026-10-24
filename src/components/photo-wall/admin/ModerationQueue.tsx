'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import {
  MODERATION_TABS,
  MODERATION_TAB_LABELS,
  countByTab,
  postsInTab,
  type ModerationQueueData,
  type ModerationTab,
} from '@/lib/photo-wall'
import { api } from '@/lib/trpc/client'
import { MODERATION_POLL_MS, moderationQueuePolling } from './polling'
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

/** The queue's section; the page has one, so its ids are fixed. */
export const MODERATION_QUEUE_ID = 'photo-wall-posts'
const tabId = (tab: ModerationTab) => `${MODERATION_QUEUE_ID}-tab-${tab}`
const panelId = `${MODERATION_QUEUE_ID}-panel`

/**
 * The pending count's Review link (§10): scroll to the queue and select and
 * focus its Pending tab, as a press on that tab would.
 */
export function revealPendingTab() {
  document
    .getElementById(MODERATION_QUEUE_ID)
    ?.scrollIntoView({ block: 'start' })
  const pending = document.getElementById(tabId('pending'))
  pending?.click()
  pending?.focus({ preventScroll: true })
}

export interface ModerationQueueViewProps {
  queue?: ModerationQueueData
  /** The first read is on its way. */
  loading?: boolean
  /** The last read failed; with `queue`, the one before it is still shown. */
  failed?: boolean
}

const EMPTY: Record<ModerationTab, string> = {
  pending: `Nothing waiting. New posts show up here within about ${MODERATION_POLL_MS / 1000} seconds of being posted.`,
  onTheWall: 'Nothing on the wall yet. Approve a pending post to show it.',
  notShown: 'Nothing here. Rejected and removed posts end up here.',
}

export function ModerationQueueView({
  queue,
  loading = false,
  failed = false,
}: ModerationQueueViewProps) {
  const [tab, setTab] = useState<ModerationTab>('pending')
  const tabRefs = useRef<Partial<Record<ModerationTab, HTMLButtonElement>>>({})

  const counts = countByTab(queue?.posts ?? [])
  const posts = queue ? postsInTab(queue.posts, tab) : []

  /** Arrow keys, Home and End move between the tabs and select (WAI-ARIA). */
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const move = KEY_MOVES[event.key]
    if (!move) return
    event.preventDefault()
    const target =
      MODERATION_TABS[
        move(MODERATION_TABS.indexOf(tab), MODERATION_TABS.length - 1)
      ]
    setTab(target)
    tabRefs.current[target]?.focus()
  }

  return (
    <section
      id={MODERATION_QUEUE_ID}
      aria-labelledby={`${MODERATION_QUEUE_ID}-title`}
      className="scroll-mt-20 space-y-4"
    >
      {/* The live pending count is at the top of the page (`PendingSummary`),
          the page's one live region for it; the Pending tab shows it here. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id={`${MODERATION_QUEUE_ID}-title`}
          className="text-base font-semibold text-gray-900 dark:text-white"
        >
          Posts
        </h2>
        {!queue && loading && (
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Loading posts…
          </p>
        )}
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
              // No counts without data: a failed first load is not zero.
              aria-label={
                queue
                  ? `${MODERATION_TAB_LABELS[t]} (${counts[t]})`
                  : MODERATION_TAB_LABELS[t]
              }
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
              {queue && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                    selected
                      ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                      : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {counts[t]}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)}>
        {!queue ? (
          // No data: the skeleton while the first read is on its way, else
          // nothing (the alert above says why); never an empty-tab text.
          loading && <Skeleton />
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

/** Each key's next tab index, from the current one and the last (WAI-ARIA). */
const KEY_MOVES: Partial<Record<string, (at: number, last: number) => number>> =
  {
    ArrowRight: (at, last) => (at === last ? 0 : at + 1),
    ArrowLeft: (at, last) => (at === 0 ? last : at - 1),
    Home: () => 0,
    End: (_, last) => last,
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
          className="aspect-4/3 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
        />
      ))}
    </div>
  )
}
