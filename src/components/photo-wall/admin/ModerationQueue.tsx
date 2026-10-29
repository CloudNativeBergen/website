'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  APPROVE_ALL_MAX,
  MODERATION_TABS,
  allowsFrom,
  MODERATION_TAB_LABELS,
  countByTab,
  postsInTab,
  type ModerationPost,
  type ModerationQueueData,
  type ModerationTab,
  type PostingState,
} from '@/lib/photo-wall'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { focusIsWith } from '../focus'
import { PendingSummary } from './PendingSummary'
import { MODERATION_POLL_MS, moderationQueuePolling } from './polling'
import {
  WallPostCard,
  type PostAction,
  type PostActionOutcome,
  type WallPostCardProps,
} from './WallPostCard'

/**
 * The moderation queue on `/admin/photo-wall` (Photo Wall spec §8, §10):
 * `photoWall.moderationQueue`, polled every 10 s while the page is visible
 * and never stopped for idleness, in the tabs Pending, On the wall and Not
 * shown, with each card's actions and Approve all pending. After every
 * action the queue is read again, so the card moves to its new tab.
 */
export function ModerationQueue({ posting }: { posting?: PostingState }) {
  const queue = api.photoWall.moderationQueue.useQuery(
    undefined,
    moderationQueuePolling,
  )
  const utils = api.useUtils()
  const approve = api.photoWall.approve.useMutation()
  const reject = api.photoWall.reject.useMutation()
  const remove = api.photoWall.remove.useMutation()
  const undoToPending = api.photoWall.undoToPending.useMutation()
  const deletePost = api.photoWall.deletePost.useMutation()
  const withdrawMarketing = api.photoWall.withdrawMarketing.useMutation()
  const approveAll = api.photoWall.approveAllPending.useMutation()
  const talks = api.photoWall.talks.useQuery()
  const setTalkTag = api.photoWall.setTalkTag.useMutation()

  const refresh = () => void utils.photoWall.moderationQueue.invalidate()

  const onAction = async (
    post: ModerationPost,
    action: QueueAction,
    decidedAt?: string,
  ): Promise<QueueActionOutcome> => {
    const id = post._id
    // Which post the card showed: never an action on a replacement under
    // the same id (§6.2).
    const shown = post.incarnation
    try {
      switch (action) {
        case 'approve': {
          // The cards offer Approve only where the transitions allow it.
          if (!allowsFrom('approve', post.status)) return 'changed'
          return decided(
            await approve.mutateAsync({ id, from: post.status, shown }),
          )
        }
        case 'reject':
          return decided(await reject.mutateAsync({ id, shown }))
        case 'remove':
          if (!allowsFrom('remove', post.status)) return 'changed'
          return decided(
            await remove.mutateAsync({
              id,
              from: post.status,
              decidedAt,
              shown,
            }),
          )
        case 'undoToPending':
          if (!decidedAt || !allowsFrom('undoToPending', post.status))
            return 'changed'
          return (
            await undoToPending.mutateAsync({
              id,
              from: post.status,
              decidedAt,
              shown,
            })
          ).status
        case 'withdrawMarketing':
          return (await withdrawMarketing.mutateAsync({ id, shown })).status
        case 'delete': {
          const { status } = await deletePost.mutateAsync({ id, shown })
          return status === 'deleted' ? 'done' : status
        }
      }
    } catch {
      return 'failed'
    } finally {
      refresh()
    }
  }

  const onSetTalk = async (
    post: ModerationPost,
    talkId: string | null,
  ): Promise<PostActionOutcome> => {
    try {
      return (
        await setTalkTag.mutateAsync({
          id: post._id,
          shown: post.incarnation,
          talkId,
        })
      ).status
    } catch {
      return 'failed'
    } finally {
      refresh()
    }
  }

  const onApproveAll = async (posts: ModerationPost[]) => {
    try {
      return await approveAll.mutateAsync({
        shown: posts.map((p) => ({ id: p._id, ...p.incarnation })),
      })
    } finally {
      refresh()
    }
  }

  return (
    <ModerationQueueView
      queue={queue.data}
      loading={queue.isPending}
      failed={queue.isError}
      onAction={onAction}
      onApproveAll={onApproveAll}
      talks={talks.data}
      onSetTalk={onSetTalk}
      posting={posting}
      summary={<PendingSummary />}
    />
  )
}

/** What takes focus when pressed. */
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]'

/**
 * A card's identity: the post's id AND its creation. A submit can create a
 * new post under the id of one just deleted (§6.2); keyed so, the new post
 * gets a fresh card (no Delete confirm left open on it, no lock or failure
 * of the old one). Not the photo id: a `deleting` card hides it, and the
 * card must not remount in the middle of its own Delete.
 */
function cardKey(post: ModerationPost): string {
  return `${post._id}@${post.incarnation.createdAt ?? ''}`
}

/** A card's action, or the Undo back to Pending, which no card offers. */
type QueueAction = PostAction | 'undoToPending'

/** A decision's outcome; `done` may carry the decision time it wrote. */
type QueueActionOutcome =
  PostActionOutcome | { status: 'done'; decidedAt?: string | null }

function decided(result: {
  status: Exclude<PostActionOutcome, 'failed'>
  decidedAt?: string | null
}): QueueActionOutcome {
  return result.status === 'done'
    ? { status: 'done', decidedAt: result.decidedAt }
    : result.status
}

/** A card action that failed, and the post as it was when it did. */
interface Failure {
  action: PostAction
  status: ModerationPost['status']
  decidedAt: string | null
}

/** The failure to show on `post`: only while it is as it was then. */
function failureOn(failure: Failure | undefined, post: ModerationPost) {
  return failure &&
    failure.status === post.status &&
    failure.decidedAt === post.decidedAt
    ? failure.action
    : null
}

/** What the card shows as running; an Undo to Pending has no button. */
function busyOn(action: QueueAction | undefined): PostAction | null {
  return !action || action === 'undoToPending' ? null : action
}

/** `record` without `key`. */
function without<T>(record: Record<string, T>, key: string) {
  const rest = { ...record }
  delete rest[key]
  return rest
}

/** The queue's section; the page has one, so its ids are fixed. */
export const MODERATION_QUEUE_ID = 'photo-wall-posts'
const tabId = (tab: ModerationTab) => `${MODERATION_QUEUE_ID}-tab-${tab}`
const panelId = `${MODERATION_QUEUE_ID}-panel`

export interface ModerationQueueViewProps {
  queue?: ModerationQueueData
  /** The first read is on its way. */
  loading?: boolean
  /** The last read failed; with `queue`, the one before it is still shown. */
  failed?: boolean
  /**
   * Runs a card's action, or an Undo; without it the cards are read only.
   * `decidedAt` (Remove and Undo to Pending) is the decision time the post
   * must still carry. A `done` may answer the decision time it wrote.
   */
  onAction?: (
    post: ModerationPost,
    action: QueueAction,
    decidedAt?: string,
  ) => Promise<QueueActionOutcome>
  /**
   * Approve all pending of these posts (the Pending cards shown); without it
   * the Pending tab has no such button.
   */
  onApproveAll?: (
    posts: ModerationPost[],
  ) => Promise<{ approved: number; decidedAt?: string }>
  /** The cards' tag picker and its write (Talk photos spec §6.3). */
  talks?: WallPostCardProps['talks']
  onSetTalk?: WallPostCardProps['onSetTalk']
  /** Why posting is closed, if it is: an empty Pending tab says so (§7). */
  posting?: PostingState
  /** The live pending count, beside the heading. */
  summary?: ReactNode
}

/** What the queue says after an action, for every outcome but a failure. */
const DONE: Record<QueueAction, string> = {
  undoToPending: 'Moved back to Pending.',
  approve: 'Approved. It shows on the wall within a few seconds.',
  reject: 'Rejected. It’s in Not shown.',
  remove: 'Removed from the wall. It’s in Not shown.',
  withdrawMarketing:
    'Marketing OK withdrawn. The photo is left out of the marketing export.',
  delete: 'Deleted for good.',
}
const NOTICES: Record<Exclude<PostActionOutcome, 'done' | 'failed'>, string> = {
  changed:
    'Another organizer changed this photo first. Showing it as it is now.',
  gone: 'This photo was deleted.',
}

/**
 * UNDO (§10): a true undo, back to the status the post had before. What
 * undoes each decision, by the status it started from, and what the toast
 * says it does.
 */
function undoOf(
  action: PostAction,
  from: ModerationPost['status'],
): {
  after: ModerationPost['status']
  reverse: QueueAction
  says: string
} | null {
  switch (action) {
    case 'approve':
      return from === 'pending'
        ? {
            after: 'approved',
            reverse: 'undoToPending',
            says: 'Approved · Undo moves it back to Pending',
          }
        : {
            after: 'approved',
            reverse: 'remove',
            says: 'Approved · Undo moves it back to Not shown',
          }
    case 'reject':
      return {
        after: 'notShown',
        reverse: 'undoToPending',
        says: 'Rejected · Undo moves it back to Pending',
      }
    case 'remove':
      return {
        after: 'notShown',
        reverse: 'approve',
        says: 'Removed · Undo puts it back on the wall',
      }
    default:
      return null
  }
}

/** How long the Undo toast stays, unless focus is in it. */
export const UNDO_MS = 8000

/** The latest undoable action: only it can be undone. */
interface Undoable {
  says: string
  undo: () => void
}

/** An empty Pending tab while posting is shut: no new posts are coming. */
const emptyPending = (posting?: PostingState) =>
  !posting || posting === 'open'
    ? EMPTY.pending
    : posting === 'paused'
      ? 'Nothing waiting. Posting is paused, so no new photos come in.'
      : posting === 'notYetOpen'
        ? 'Nothing waiting. Posting hasn’t opened yet.'
        : 'Nothing waiting. Posting is closed.'

const EMPTY: Record<ModerationTab, string> = {
  pending: `Nothing waiting. New posts show up here within about ${MODERATION_POLL_MS / 1000} seconds of being posted.`,
  onTheWall: 'Nothing on the wall yet. Approve a pending post to show it.',
  notShown: 'Nothing here. Rejected and removed posts end up here.',
}

export function ModerationQueueView({
  queue,
  loading = false,
  failed = false,
  onAction,
  onApproveAll,
  talks,
  onSetTalk,
  posting,
  summary,
}: ModerationQueueViewProps) {
  const [tab, setTab] = useState<ModerationTab>('pending')
  // The page's one polite word on what an action did: the card it was on
  // usually moves to another tab, or goes, when the queue is read again.
  const [notice, setNotice] = useState('')
  // What is in flight, kept HERE and not in the cards or the Approve all
  // row: those unmount on a tab switch, and a lock that went with them would
  // let the same press be sent again on the way back.
  const [inFlight, setInFlight] = useState<Record<string, QueueAction>>({})
  // The last action that failed on each post, and the post as it was seen
  // then (status and last decision): the card says so, back on its tab too.
  // A new action on the post, or any decision seen since (even one that
  // brought the status back), ends it.
  const [failures, setFailures] = useState<Record<string, Failure>>({})
  const [undoable, setUndoable] = useState<Undoable | null>(null)
  const dismissUndo = useCallback(() => setUndoable(null), [])
  const [approvingAll, setApprovingAll] = useState(false)
  const [approveAllFailed, setApproveAllFailed] = useState(false)
  const tabRefs = useRef<Partial<Record<ModerationTab, HTMLButtonElement>>>({})
  const panelRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  // THE FOCUS RULE: where focus last was in the queue (`card`: the index of
  // the card it was in, null outside a card). Whenever the posts or the tab
  // change, and focus has been lost (it is on <body>, or
  // on a node no longer in the page) while it was last in the queue, it goes
  // to the card now at that index (the last one if fewer), else the tab.
  // Never anywhere else: focus that is somewhere is left alone. (An action's
  // end needs no trigger of its own: what it unmounts goes with a read of the
  // posts, and the card's own confirm hands focus back itself.)
  const lastFocus = useRef<{ card: number | null } | null>(null)

  const counts = countByTab(queue?.posts ?? [])
  const posts = queue ? postsInTab(queue.posts, tab) : []
  // What Approve all approves: the Pending cards shown, oldest first.
  const shownPending = queue
    ? postsInTab(queue.posts, 'pending').slice(0, APPROVE_ALL_MAX)
    : []

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const track = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element) || !section.contains(target)) {
        // Focus (or a press) went elsewhere on the page: not the queue's.
        lastFocus.current = null
        return
      }
      if (event.type !== 'focusin') {
        // A press on content that takes no focus (a caption, a photo) drops
        // focus on purpose: never pulled back on the next read. A press on a
        // control is followed by its own `focusin`.
        if (!target.closest(FOCUSABLE)) lastFocus.current = null
        return
      }
      const card = target.closest('article')
      const cards = [...(panelRef.current?.querySelectorAll('article') ?? [])]
      lastFocus.current = { card: card ? cards.indexOf(card) : null }
    }
    document.addEventListener('focusin', track)
    document.addEventListener('pointerdown', track)
    return () => {
      document.removeEventListener('focusin', track)
      document.removeEventListener('pointerdown', track)
    }
  }, [])

  useEffect(() => {
    const last = lastFocus.current
    if (!last) return
    const active = document.activeElement
    const lost = !active || active === document.body || !active.isConnected
    if (!lost) return
    const cards = panelRef.current?.querySelectorAll('article') ?? []
    const card =
      last.card === null
        ? undefined
        : cards[Math.min(last.card, cards.length - 1)]
    const target =
      card?.querySelector<HTMLElement>('[data-decision]') ??
      tabRefs.current[tab]
    target?.focus()
  }, [queue, tab])

  const act = onAction
    ? async (
        post: ModerationPost,
        action: QueueAction,
        offerUndo = true,
        decidedAt?: string,
      ): Promise<PostActionOutcome | null> => {
        const key = cardKey(post)
        if (inFlight[key]) return null
        setInFlight((all) => ({ ...all, [key]: action }))
        setFailures((all) => without(all, key))
        setNotice('')
        setUndoable(null)
        let outcome: PostActionOutcome = 'failed'
        let wrote: string | null | undefined
        try {
          const answer = await onAction(post, action, decidedAt)
          if (typeof answer === 'string') outcome = answer
          else {
            outcome = 'done'
            wrote = answer.decidedAt
          }
        } catch {
          // A handler that throws is a failed action, never a locked card.
        } finally {
          setInFlight((all) => without(all, key))
        }
        if (outcome === 'failed' && action === 'undoToPending') {
          setNotice('Undo failed. The photo is as it was before Undo.')
        } else if (outcome === 'failed') {
          const failedAction = action as PostAction
          setFailures((all) => ({
            ...all,
            [key]: {
              action: failedAction,
              status: post.status,
              decidedAt: post.decidedAt,
            },
          }))
        }
        const undo =
          action === 'undoToPending' ? null : undoOf(action, post.status)
        if (outcome === 'done' && undo && offerUndo) {
          // The post as the action left it, the same incarnation, and the
          // decision time it wrote: the server answers `changed` if anyone
          // decided in between.
          const after = {
            ...post,
            status: undo.after,
            decidedAt: wrote ?? post.decidedAt,
          }
          setUndoable({
            says: undo.says,
            undo: () =>
              void act?.(after, undo.reverse, false, wrote ?? undefined),
          })
        } else if (outcome === 'done') setNotice(DONE[action])
        else if (outcome !== 'failed') setNotice(NOTICES[outcome])
        return outcome
      }
    : undefined

  const approveAll = async () => {
    if (!onApproveAll || approvingAll) return false
    const shownNow = shownPending
    setApprovingAll(true)
    setApproveAllFailed(false)
    setNotice('')
    setUndoable(null)
    try {
      const { approved, decidedAt } = await onApproveAll(shownNow)
      const photos = `${approved} ${approved === 1 ? 'photo' : 'photos'}`
      if (approved !== shownNow.length) {
        setNotice(
          `Approved ${approved} of ${shownNow.length}. The others changed meanwhile or took too long; any still pending can be approved again.`,
        )
      }
      // One Undo for the batch: every post it SENT, acknowledged or not.
      // Each Undo requires the batch's decision time, so a post that was
      // never approved, or approved by anyone else, is left as it is.
      if (approved && decidedAt && onAction) {
        setUndoable({
          says: `Approved ${photos} · Undo moves ${approved === 1 ? 'it' : 'them'} back to Pending`,
          undo: () => void undoApproveAll(shownNow, decidedAt),
        })
      } else if (approved === shownNow.length) {
        setNotice(`Approved ${photos}.`)
      }
      return true
    } catch {
      setApproveAllFailed(true)
      return false
    } finally {
      setApprovingAll(false)
    }
  }

  /**
   * Undo of Approve all: each post it sent back to Pending, four at a time.
   * One not approved by this batch is refused as `changed`: nothing to undo.
   */
  const undoApproveAll = async (sent: ModerationPost[], decidedAt: string) => {
    if (!onAction) return
    setNotice('')
    let next = 0
    let done = 0
    let failed = 0
    const worker = async () => {
      while (next < sent.length) {
        const post = sent[next++]
        const after = { ...post, status: 'approved' as const }
        const answer = await onAction(after, 'undoToPending', decidedAt).catch(
          () => 'failed' as const,
        )
        const outcome = typeof answer === 'string' ? answer : answer.status
        if (outcome === 'done') done += 1
        else if (outcome === 'failed') failed += 1
      }
    }
    await Promise.all([0, 1, 2, 3].map(worker))
    const photos = `${done} ${done === 1 ? 'photo' : 'photos'}`
    setNotice(
      failed
        ? `Moved ${photos} back to Pending. ${failed} could not be moved; remove ${failed === 1 ? 'it' : 'them'} from the wall by hand.`
        : `Moved ${photos} back to Pending.`,
    )
  }

  /**
   * THE QUEUE'S SHORTCUTS (§10): J/K and the arrow keys move between cards
   * (to each card's first control, the photo, so Enter opens it large), A
   * approves and R rejects the card with focus, U undoes. Never from a
   * field, an open menu or a dialog, nor with a modifier; the tabs keep
   * their own arrow keys (they handle them first).
   */
  const onQueueKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return
    if (event.altKey) return
    const target = event.target as HTMLElement
    if (target.closest(NO_SHORTCUTS) || document.querySelector('[role="menu"]'))
      return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    if (key === 'u') {
      if (!undoable) return
      event.preventDefault()
      setUndoable(null)
      undoable.undo()
      return
    }
    const cards = [...(panelRef.current?.querySelectorAll('article') ?? [])]
    const card = target.closest('article')
    const at = card ? cards.indexOf(card) : -1
    const step = CARD_STEPS[key]
    if (step) {
      const next = cards[Math.max(0, Math.min(cards.length - 1, at + step))]
      if (!next) return
      event.preventDefault()
      next.querySelector<HTMLElement>(FOCUSABLE)?.focus()
      return
    }
    const action = key === 'a' ? 'approve' : key === 'r' ? 'reject' : null
    const post = at < 0 ? undefined : posts[at]
    if (!action || !post || !act || !allowsFrom(action, post.status)) return
    event.preventDefault()
    void act(post, action)
  }

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
      ref={sectionRef}
      id={MODERATION_QUEUE_ID}
      aria-labelledby={`${MODERATION_QUEUE_ID}-title`}
      // While the Undo toast shows, room below the last card to scroll it
      // clear of the toast (a phone has no margin beside it).
      className={`scroll-mt-20 space-y-4 ${undoable ? 'pb-28' : ''}`}
      onKeyDown={onQueueKeyDown}
    >
      {/* The live pending count (`PendingSummary`) sits beside the heading,
          the page's one live region for it. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id={`${MODERATION_QUEUE_ID}-title`}
          className="text-base font-semibold text-gray-900 dark:text-white"
        >
          Posts
        </h2>
        {summary}
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
      <p
        role="status"
        className="text-sm font-medium text-gray-700 empty:hidden dark:text-gray-300"
      >
        {notice}
      </p>
      {undoable && <UndoToast undoable={undoable} onDismiss={dismissUndo} />}
      <div
        role="tablist"
        aria-label="Posts by status"
        className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900"
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
      {onAction && (
        // A keyboard's shortcuts: not on a phone.
        <p className="hidden text-xs text-gray-600 sm:block dark:text-gray-400">
          J/K move · A approve · R reject · U undo
        </p>
      )}
      <div
        ref={panelRef}
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(tab)}
        className="space-y-4"
      >
        {queue &&
          tab === 'pending' &&
          onApproveAll &&
          shownPending.length > 0 && (
            <ApproveAll
              count={shownPending.length}
              busy={approvingAll}
              failed={approveAllFailed}
              onApproveAll={approveAll}
            />
          )}
        {!queue ? (
          // No data: the skeleton while the first read is on its way, else
          // nothing (the alert above says why); never an empty-tab text.
          loading && <Skeleton />
        ) : posts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-600 dark:text-gray-400">
            {tab === 'pending' ? emptyPending(posting) : EMPTY[tab]}
          </p>
        ) : (
          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {posts.map((post) => (
              <WallPostCard
                key={cardKey(post)}
                post={post}
                onAction={act}
                busy={busyOn(inFlight[cardKey(post)])}
                failed={failureOn(failures[cardKey(post)], post)}
                talks={talks}
                onSetTalk={onSetTalk}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/** Each key's next tab index, from the current one and the last (WAI-ARIA). */
/** Where the queue's shortcuts never fire: typing, a menu, a dialog. */
const NO_SHORTCUTS =
  'input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"]'

/** J/K and the arrow keys: one card on or back. */
const CARD_STEPS: Partial<Record<string, number>> = {
  j: 1,
  k: -1,
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
}

const KEY_MOVES: Partial<Record<string, (at: number, last: number) => number>> =
  {
    ArrowRight: (at, last) => (at === last ? 0 : at + 1),
    ArrowLeft: (at, last) => (at === 0 ? last : at - 1),
    Home: () => 0,
    End: (_, last) => last,
  }

/**
 * The Undo toast (§10): fixed at the bottom, gone after {@link UNDO_MS}
 * (held while focus is in it), Escape dismisses it. Not the admin
 * NotificationProvider, which has no action slot and is not on this page.
 */
function UndoToast({
  undoable,
  onDismiss,
}: {
  undoable: Undoable
  onDismiss: () => void
}) {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (held) return
    const timer = setTimeout(onDismiss, UNDO_MS)
    return () => clearTimeout(timer)
  }, [undoable, held, onDismiss])
  return (
    <div
      role="status"
      aria-live="polite"
      tabIndex={-1}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        onDismiss()
      }}
      className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg ring-1 ring-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:bg-gray-700 dark:ring-white/10"
    >
      <span className="flex-1">{undoable.says}</span>
      <button
        type="button"
        onClick={() => {
          onDismiss()
          undoable.undo()
        }}
        className="inline-flex min-h-10 items-center rounded-md px-3 font-semibold text-indigo-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-indigo-300"
      >
        Undo
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="inline-flex size-10 items-center justify-center rounded-md text-gray-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-indigo-300"
      >
        <XMarkIcon className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}

function Skeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="aspect-square animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
        />
      ))}
    </div>
  )
}

/**
 * Approve all pending (N) with an inline confirm (§10). N is the Pending
 * cards shown, and those are what the server approves, skipping any that
 * changed meanwhile. Its busy and failed state live in the queue, which
 * outlives this row across tab switches.
 */
function ApproveAll({
  count,
  busy,
  failed,
  onApproveAll,
}: {
  count: number
  busy: boolean
  failed: boolean
  /** True when it went through. */
  onApproveAll: () => Promise<boolean>
}) {
  const [confirming, setConfirming] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const openRef = useRef<HTMLButtonElement>(null)

  // After the swap, the button that had focus has left the page: focus is
  // handed on once the swap is committed, but only if it went with it.
  // Focus the organizer moved elsewhere while the run went stays there.
  const handBack = useRef(false)
  useEffect(() => {
    if (!handBack.current) return
    handBack.current = false
    if (!focusIsWith(null)) return
    ;(confirming ? confirmRef : openRef).current?.focus({ preventScroll: true })
  }, [confirming])
  const show = (on: boolean) => {
    handBack.current = true
    setConfirming(on)
  }

  const run = async () => {
    if (busy) return
    if (await onApproveAll()) show(false)
  }

  const photos = `${count} pending ${count === 1 ? 'photo' : 'photos'}`
  return (
    <div className="space-y-2">
      {confirming ? (
        <div
          role="group"
          aria-labelledby="photo-wall-approve-all-confirm"
          className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900"
        >
          <p
            id="photo-wall-approve-all-confirm"
            className="text-sm font-medium text-gray-900 dark:text-white"
          >
            Approve all {photos}? They go on the wall.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              ref={confirmRef}
              type="button"
              aria-disabled={busy || undefined}
              onClick={run}
              className="inline-flex min-h-10 items-center rounded-md bg-green-700 px-3 text-sm font-semibold text-white shadow-xs hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait aria-disabled:opacity-60 dark:focus-visible:outline-indigo-400"
            >
              {busy ? 'Approving…' : 'Approve all'}
            </button>
            <button
              type="button"
              aria-disabled={busy || undefined}
              onClick={() => !busy && show(false)}
              className="inline-flex min-h-10 items-center rounded-md bg-white px-3 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait aria-disabled:opacity-60 dark:bg-gray-700 dark:text-white dark:ring-gray-500 dark:hover:bg-gray-600 dark:focus-visible:outline-indigo-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={openRef}
          type="button"
          // Back on this tab while a run is still going: it says so, and a
          // press does nothing.
          aria-disabled={busy || undefined}
          onClick={() => !busy && show(true)}
          className="inline-flex min-h-10 items-center rounded-md bg-white px-3 text-sm font-semibold text-green-800 shadow-xs ring-1 ring-green-700/40 ring-inset hover:bg-green-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait aria-disabled:opacity-60 dark:bg-gray-800 dark:text-green-300 dark:ring-green-400/40 dark:hover:bg-green-950 dark:focus-visible:outline-indigo-400"
        >
          {busy ? 'Approving all…' : `Approve all pending (${count})`}
        </button>
      )}
      {failed && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Couldn’t approve them. Try again.
        </p>
      )}
    </div>
  )
}
