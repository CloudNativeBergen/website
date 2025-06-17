'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { BlueskyIcon } from '@/components/SocialIcons'
import { extractHandleFromUrl } from '@/lib/bluesky/utils'

// Proper TypeScript interfaces for Bluesky API responses
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
}

// Utility function for relative time formatting
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

// Extract post ID from AT URI
const extractPostId = (uri: string): string => uri.split('/').pop() || ''

// Enhanced error types
type FetchError = {
  message: string
  status?: number
  retryable: boolean
}

export function BlueskyFeed({
  blueskyHandle,
  className = '',
  postCount = 3,
}: BlueskyFeedProps) {
  const [posts, setPosts] = useState<BlueskyPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<FetchError | null>(null)

  // Memoize the handle extraction to avoid recalculation
  const handle = useMemo(
    () => extractHandleFromUrl(blueskyHandle) || blueskyHandle,
    [blueskyHandle],
  )

  // Memoized fetch function with proper error handling and cancellation
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

        // Retry logic for retryable errors
        if (fetchError.retryable && retryCount < maxRetries) {
          retryCount++
          setTimeout(
            () => {
              if (!abortController.signal.aborted) {
                fetchWithRetry()
              }
            },
            Math.pow(2, retryCount) * 1000,
          ) // Exponential backoff
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

    // Cleanup function to cancel ongoing requests
    return () => {
      abortController.abort()
    }
  }, [handle, postCount, fetchBlueskyPosts])

  // Memoized post items to prevent unnecessary re-renders
  // This must be before any conditional returns to follow Rules of Hooks
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
          className={`space-y-3 ${index > 0 ? 'border-t border-gray-100 pt-4' : ''}`}
          aria-label={`Post by ${post.author.displayName || post.author.handle}`}
        >
          {/* Author information */}
          <header className="flex items-center gap-2">
            {post.author.avatar ? (
              <img
                src={post.author.avatar}
                alt=""
                className="h-6 w-6 rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600"
                aria-hidden="true"
              >
                <span className="text-xs font-medium text-white">
                  {(post.author.displayName || post.author.handle)
                    .charAt(0)
                    .toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-medium text-gray-900">
                {post.author.displayName || post.author.handle}
              </h3>
              <p className="text-xs text-gray-500">@{post.author.handle}</p>
            </div>
          </header>

          {/* Post content */}
          <div className="text-sm leading-relaxed text-gray-700">
            {post.record.text}
          </div>

          {/* Post footer */}
          <footer className="flex items-center justify-between text-xs text-gray-500">
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
              className="rounded font-medium text-blue-500 hover:text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none"
              aria-label={`View post by ${post.author.displayName || post.author.handle} on Bluesky`}
            >
              View on Bluesky
            </a>
          </footer>
        </article>
      )
    })
  }, [posts])

  // Optimized loading component with better skeleton UI
  if (loading) {
    return (
      <div className={`rounded-lg bg-white p-4 shadow-sm ${className}`}>
        <div className="mb-3 flex items-center gap-2">
          <BlueskyIcon className="h-5 w-5 text-blue-500" />
          <span className="font-medium text-gray-900">Latest from Bluesky</span>
        </div>
        <div className="space-y-4">
          {Array.from({ length: postCount }).map((_, i) => (
            <div
              key={i}
              className={`space-y-3 ${i > 0 ? 'border-t pt-4' : ''}`}
            >
              {/* Author skeleton */}
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 animate-pulse rounded-full bg-gray-200" />
                <div className="flex-1">
                  <div className="mb-1 h-4 w-24 animate-pulse rounded bg-gray-200" />
                  <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
                </div>
              </div>
              {/* Content skeleton */}
              <div className="space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
              </div>
              {/* Footer skeleton */}
              <div className="flex items-center justify-between">
                <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Enhanced error handling - only show for non-retryable errors
  if (error && !error.retryable) {
    return null // Gracefully hide component on error
  }

  // No posts state
  if (!posts || posts.length === 0) {
    return null
  }

  return (
    <section
      className={`rounded-lg bg-white p-4 shadow-sm ${className}`}
      aria-label="Latest Bluesky posts"
    >
      <header className="mb-3 flex items-center gap-2">
        <BlueskyIcon className="h-5 w-5 text-blue-500" aria-hidden="true" />
        <h2 className="font-medium text-gray-900">
          Latest from Bluesky{' '}
          {posts.length > 1 && (
            <span className="text-gray-500">({posts.length})</span>
          )}
        </h2>
      </header>

      <div className="space-y-4">{postItems}</div>
    </section>
  )
}
