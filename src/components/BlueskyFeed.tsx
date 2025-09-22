'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { BlueskyIcon } from '@/components/SocialIcons'
import { extractHandleFromUrl } from '@/lib/bluesky/utils'

interface BlueskyAuthor {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

interface BlueskyRecord {
  $type: string
  createdAt: string
  text: string
}

interface BlueskyPost {
  uri: string
  cid: string
  author: BlueskyAuthor
  record: BlueskyRecord
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

const formatRelativeTime = (date: Date): string => {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

const extractPostId = (uri: string): string => uri.split('/').pop() || ''

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
    const maxRetries = 2

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

        if (fetchError.retryable && retryCount < maxRetries) {
          retryCount++
          setTimeout(
            () => {
              if (!abortController.signal.aborted) {
                fetchWithRetry()
              }
            },
            Math.pow(2, retryCount) * 1000,
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

    return () => {
      abortController.abort()
    }
  }, [handle, postCount, fetchBlueskyPosts])

  const postItems = useMemo(() => {
    if (!posts || posts.length === 0) return []

    return posts.map((post, index) => {
      const postDate = new Date(post.record.createdAt)
      const relativeTime = formatRelativeTime(postDate)
      const postId = extractPostId(post.uri)
      const postUrl = `https://bsky.app/profile/${post.author.handle}/post/${postId}`

      return (
        <article
          key={post.uri}
          className={`${compact ? 'space-y-2' : 'space-y-3'} ${index > 0 ? 'border-t border-gray-100 pt-3 dark:border-gray-700' : ''}`}
          aria-label={`Post by ${post.author.displayName || post.author.handle}`}
        >
          <header
            className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}
          >
            {post.author.avatar ? (
              <img
                src={post.author.avatar}
                alt=""
                className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} rounded-full object-cover`}
                loading="lazy"
              />
            ) : (
              <div
                className={`flex ${compact ? 'h-5 w-5' : 'h-6 w-6'} items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600`}
                aria-hidden="true"
              >
                <span
                  className={`${compact ? 'text-[10px]' : 'text-xs'} font-medium text-white`}
                >
                  {(post.author.displayName || post.author.handle)
                    .charAt(0)
                    .toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3
                className={`truncate ${compact ? 'text-xs' : 'text-sm'} font-medium text-gray-900 dark:text-white`}
              >
                {post.author.displayName || post.author.handle}
              </h3>
              {!compact && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  @{post.author.handle}
                </p>
              )}
            </div>
          </header>

          <div
            className={`${compact ? 'text-sm leading-relaxed' : 'text-sm leading-relaxed'} text-gray-700 dark:text-gray-300`}
          >
            {compact && post.record.text.length > 140
              ? `${post.record.text.substring(0, 140)}...`
              : post.record.text}
          </div>

          <footer
            className={`flex items-center justify-between ${compact ? 'text-xs' : 'text-xs'} text-gray-500 dark:text-gray-400`}
          >
            <time
              dateTime={post.record.createdAt}
              title={postDate.toLocaleString()}
            >
              {relativeTime}
            </time>
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded font-medium text-blue-500 hover:text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none ${compact ? 'text-xs' : ''} dark:text-blue-400 dark:hover:text-blue-300 dark:focus:ring-offset-gray-800`}
              aria-label={`View post by ${post.author.displayName || post.author.handle} on Bluesky`}
            >
              {compact ? 'View' : 'View on Bluesky'}
            </a>
          </footer>
        </article>
      )
    })
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
