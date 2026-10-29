'use client'

import { useEffect, useRef } from 'react'
import {
  pendingOf,
  type ModerationQueueData,
} from '@/lib/photo-wall/moderation'
import { api } from '@/lib/trpc/client'

/**
 * Keeps the admin nav's Photo Wall badge (Photo Wall spec §10, P6) in step
 * with this page: each queue read the page polls puts its pending count
 * into the shell's `photoWall.pendingCount`, the page's own actions
 * included, with no read of its own. Only reads made while the page is
 * mounted: a queue cached from an earlier visit can be older than the count
 * the shell has read since, and would put the badge back.
 */
export function usePushPendingCount(queue: {
  data?: ModerationQueueData
  dataUpdatedAt: number
}): void {
  const utils = api.useUtils()
  const { data, dataUpdatedAt } = queue
  const atMount = useRef(dataUpdatedAt)
  useEffect(() => {
    if (!data || dataUpdatedAt === atMount.current) return
    const count = pendingOf(data)
    let superseded = false
    // A shell read still in flight is older than this poll: cancelled
    // first, its answer cannot land over the push. A newer poll (or leaving
    // the page) before the cancel settles supersedes this push.
    void utils.photoWall.pendingCount.cancel().then(() => {
      if (!superseded) utils.photoWall.pendingCount.setData(undefined, count)
    })
    return () => {
      superseded = true
    }
  }, [data, dataUpdatedAt, utils])
}
