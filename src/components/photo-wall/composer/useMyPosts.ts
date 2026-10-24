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
 * `posts` is null until the first read answers. A failed read keeps the last
 * list. Reads may overlap (one slower than the interval is still out at the
 * next tick): each answer newer than the last one shown is shown, and an
 * older one that answers after it is ignored. Never "only the latest read":
 * with reads slower than the interval, every answer would be outdated by
 * the time it came and the list would never change.
 */
export function useMyPosts(load: () => Promise<MyPost[]>) {
  const [posts, setPosts] = useState<MyPost[] | null>(null)
  /** The last read started, and the newest one whose answer is shown. */
  const started = useRef(0)
  const shown = useRef(0)

  const refresh = useCallback(async () => {
    const read = ++started.current
    try {
      const next = await load()
      if (read > shown.current) {
        shown.current = read
        setPosts(next)
      }
    } catch (error) {
      console.error('Could not read My posts', error)
    }
  }, [load])

  useEffect(() => {
    // The first read, off the effect's own tick (no state set in its body).
    queueMicrotask(() => void refresh())
    const tick = () => {
      if (document.visibilityState !== 'hidden') void refresh()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const timer = setInterval(tick, MY_POSTS_POLL_MS)
    document.addEventListener('visibilitychange', onVisibility)
    // The counters, not a DOM node: the cleanup wants their live values.
    const [all, last] = [started, shown]
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      // A read still out answers to nobody; one a remount starts still can.
      last.current = all.current
    }
  }, [refresh])

  return { posts, refresh }
}
