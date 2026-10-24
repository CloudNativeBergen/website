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
 * list; an older read that answers after a newer one is ignored.
 */
export function useMyPosts(load: () => Promise<MyPost[]>) {
  const [posts, setPosts] = useState<MyPost[] | null>(null)
  const latest = useRef(0)

  const refresh = useCallback(async () => {
    const read = ++latest.current
    try {
      const next = await load()
      if (read === latest.current) setPosts(next)
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
    // The counter, not a DOM node: the cleanup wants its live value.
    const reads = latest
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      // A read still out answers to nobody.
      reads.current++
    }
  }, [refresh])

  return { posts, refresh }
}
