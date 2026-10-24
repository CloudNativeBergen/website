'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MyPost } from '@/lib/photo-wall/my-posts'

/** How often My posts is read while the page is visible (§8). */
export const MY_POSTS_POLL_MS = 15_000

/**
 * My posts as the composer polls it (Photo Wall spec §8): `load` (the
 * `getMyPosts` Server Action) on mount, every {@link MY_POSTS_POLL_MS}
 * while the page is visible, at once when it becomes visible again, and
 * whenever `refresh()` is called (after each action).
 *
 * NOT `useIdlePolling()`: that hook stops after five minutes without a
 * pointer, key or scroll event, and a phone waiting for its post makes none.
 * Not React Query's `refetchInterval` either: a function answering `false`
 * while hidden clears the timer when a read resolves in the background, and
 * nothing restarts it. A plain interval that skips its tick while hidden
 * cannot be cleared by a read.
 *
 * ONE READ AT A TIME. The Next client runs Server Actions one after another
 * in call order, so a poll started while a read is out would only queue
 * behind it: with reads slower than the interval the queue would grow
 * without bound, and a Delete would wait minutes behind it. So a tick or a
 * visibility change while a read is out starts nothing, and `refresh()`
 * while one is out asks for ONE follow-up read once it is in (an action's
 * effect is read after it, never by a read that started before it).
 *
 * `posts` is null until the first read answers; `listRead` numbers the read
 * it came from (reads are numbered from 1, 0 before any). A failed read
 * keeps the last list.
 */
export type MyPostsReads = ReturnType<typeof useMyPosts>

export function useMyPosts(load: () => Promise<MyPost[]>) {
  // The list shown and the read it came from (`MyPostsProps.listRead`).
  const [list, setList] = useState<{ posts: MyPost[]; read: number } | null>(
    null,
  )
  /** The reads started; and the reads that may no longer be shown. */
  const started = useRef(0)
  const stale = useRef(0)
  /** A read is out; a refresh asked for one more after it. */
  const reading = useRef(false)
  const again = useRef(false)

  const readOnce = useCallback(async () => {
    const read = ++started.current
    try {
      const next = await load()
      if (read > stale.current) setList({ posts: next, read })
    } catch (error) {
      console.error('Could not read My posts', error)
    }
  }, [load])

  /** Read now, unless a read is out: then once more after it, if `followUp`. */
  const read = useCallback(
    async (followUp: boolean) => {
      if (reading.current) {
        if (followUp) again.current = true
        return
      }
      reading.current = true
      try {
        do {
          again.current = false
          await readOnce()
        } while (again.current)
      } finally {
        reading.current = false
      }
    },
    [readOnce],
  )

  const refresh = useCallback(() => read(true), [read])

  useEffect(() => {
    // The first read, off the effect's own tick (no state set in its body).
    queueMicrotask(() => void read(false))
    const tick = () => {
      if (document.visibilityState !== 'hidden') void read(false)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void read(false)
    }
    const timer = setInterval(tick, MY_POSTS_POLL_MS)
    document.addEventListener('visibilitychange', onVisibility)
    // The counters, not a DOM node: the cleanup wants their live values.
    const [all, old] = [started, stale]
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      // A read still out answers to nobody; one a remount starts still can.
      old.current = all.current
    }
  }, [read])

  /** How many reads have started: an action's answer carries it. */
  const readsStarted = useCallback(() => started.current, [])

  return {
    posts: list?.posts ?? null,
    listRead: list?.read ?? 0,
    refresh,
    readsStarted,
  }
}
