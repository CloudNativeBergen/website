'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { BlueskyIcon } from '@/components/SocialIcons'
import { extractHandleFromUrl } from '@/lib/bluesky/utils'
import {
  BlueskyPostItem,
  type BlueskyPost as SharedBlueskyPost,
  type BlueskyAuthor,
  type BlueskyRecord,
} from '@/components/BlueskyPostItem'

const MAX_RETRIES = 2
const AUTO_UPDATE_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const RETRY_BASE_DELAY_MS = 1000

interface BlueskyPost extends SharedBlueskyPost {
  indexedAt: string
}

interface BlueskyFeedItem {
  post: {
    uri: string
    cid: string
    author: BlueskyAuthor
    record: BlueskyRecord
    indexedAt: string
  }
}

interface BlueskyFeedResponse {
  feed: BlueskyFeedItem[]
}

interface BlueskyFeedProps {
  blueskyHandle: string
  className?: string
  postCount?: number
  compact?: boolean
}

type FetchError = {
  message: string
  status?: number
  retryable: boolean
}

export function BlueskyFeed({
  blueskyHandle,
  className = '',
  postCount = 3,
  compact = false,
}: BlueskyFeedProps) {
  const [posts, setPosts] = useState<BlueskyPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<FetchError | null>(null)

  const handle = useMemo(
    () => extractHandleFromUrl(blueskyHandle) || blueskyHandle,
    [blueskyHandle],
  )

  const fetchBlueskyPosts = useCallback(
    async (signal: AbortSignal): Promise<BlueskyPost[]> => {
      const response = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=${postCount}`,
        { signal },
      )

      if (!response.ok) {
        const retryable = response.status >= 500 || response.status === 429
        throw {
          message: `Failed to fetch Bluesky posts (${response.status})`,
          status: response.status,
          retryable,
        } as FetchError
      }

      const data: BlueskyFeedResponse = await response.json()

      if (!data.feed || data.feed.length === 0) {
        return []
      }

      return data.feed.map(
        (feedItem): BlueskyPost => ({
          uri: feedItem.post.uri,
          cid: feedItem.post.cid,
          author: feedItem.post.author,
          record: feedItem.post.record,
          indexedAt: feedItem.post.indexedAt,
        }),
      )
    },
    [handle, postCount],
  )

  useEffect(() => {
    if (!handle) return

    const abortController = new AbortController()
    let retryCount = 0
    let intervalId: NodeJS.Timeout | null = null

    const fetchWithRetry = async () => {
      try {
        setLoading(true)
        setError(null)

        const fetchedPosts = await fetchBlueskyPosts(abortController.signal)

        if (!abortController.signal.aborted) {
          setPosts(fetchedPosts)
        }
      } catch (err) {
        if (abortController.signal.aborted) return

        const fetchError = err as FetchError

        if (fetchError.retryable && retryCount < MAX_RETRIES) {
          retryCount++
          setTimeout(
            () => {
              if (!abortController.signal.aborted) {
                fetchWithRetry()
              }
            },
            Math.pow(2, retryCount) * RETRY_BASE_DELAY_MS,
          )
          return
        }

        console.error('Error fetching Bluesky posts:', err)
        setError(fetchError)
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchWithRetry()

    intervalId = setInterval(() => {
      if (!abortController.signal.aborted) {
        retryCount = 0
        fetchWithRetry()
      }
    }, AUTO_UPDATE_INTERVAL_MS)

    return () => {
      abortController.abort()
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [handle, postCount, fetchBlueskyPosts])

  const postItems = useMemo(() => {
    if (!posts || posts.length === 0) return []

    return posts.map((post, index) => (
      <BlueskyPostItem
        key={post.uri}
        post={post}
        variant={compact ? 'compact' : 'default'}
        showBorder={index > 0}
      />
    ))
  }, [posts, compact])

  if (loading) {
    return (
      <div
        className={`rounded-lg bg-white ${compact ? 'p-4 shadow-md' : 'p-4'} shadow-sm ${className} dark:bg-gray-800 dark:shadow-gray-900/20`}
      >
        <div className={`${compact ? 'mb-3' : 'mb-3'} flex items-center gap-2`}>
          <BlueskyIcon className="h-5 w-5 text-blue-500 dark:text-blue-400" />
          <span
            className={`${compact ? 'text-sm' : ''} font-medium text-gray-900 dark:text-white`}
          >
            Latest from Bluesky
          </span>
        </div>
        <div className={compact ? 'space-y-3' : 'space-y-4'}>
          {Array.from({ length: postCount }).map((_, i) => (
            <div
              key={i}
              className={`${compact ? 'space-y-2' : 'space-y-3'} ${i > 0 ? 'border-t border-gray-100 pt-3 dark:border-gray-700' : ''}`}
            >
              <div
                className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}
              >
                <div
                  className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} animate-pulse rounded-full bg-gray-200 dark:bg-gray-700`}
                />
                <div className="flex-1">
                  <div
                    className={`mb-1 ${compact ? 'h-3 w-20' : 'h-4 w-24'} animate-pulse rounded bg-gray-200 dark:bg-gray-700`}
                  />
                  {!compact && (
                    <div className="h-3 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div
                  className={`${compact ? 'h-3' : 'h-4'} w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700`}
                />
                <div
                  className={`${compact ? 'h-3' : 'h-4'} w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700`}
                />
              </div>
              <div className="flex items-center justify-between">
                <div
                  className={`${compact ? 'h-2.5 w-12' : 'h-3 w-16'} animate-pulse rounded bg-gray-200 dark:bg-gray-700`}
                />
                <div
                  className={`${compact ? 'h-2.5 w-16' : 'h-3 w-20'} animate-pulse rounded bg-gray-200 dark:bg-gray-700`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error && !error.retryable) {
    return null
  }

  if (!posts || posts.length === 0) {
    return null
  }

  return (
    <section
      className={`rounded-lg bg-white ${compact ? 'p-4 shadow-md' : 'p-4'} shadow-sm ${className} dark:bg-gray-800 dark:shadow-gray-900/20`}
      aria-label="Latest Bluesky posts"
    >
      <header
        className={`${compact ? 'mb-3' : 'mb-3'} flex items-center gap-2`}
      >
        <BlueskyIcon
          className="h-5 w-5 text-blue-500 dark:text-blue-400"
          aria-hidden="true"
        />
        <h2
          className={`${compact ? 'text-sm' : ''} font-medium text-gray-900 dark:text-white`}
        >
          Latest from Bluesky{' '}
          {posts.length > 1 && (
            <span className="text-gray-500 dark:text-gray-400">
              ({posts.length})
            </span>
          )}
        </h2>
      </header>

      <div className={compact ? 'space-y-3' : 'space-y-4'}>{postItems}</div>
    </section>
  )
}
