import { useMemo } from 'react'
import { BlueskyIcon } from '@/components/SocialIcons'

// TypeScript interfaces from BlueskyFeed component
interface BlueskyAuthor {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

interface BlueskyRecord {
  text: string
  createdAt: string
  embed?: BlueskyEmbed
}

interface BlueskyImage {
  thumb: string
  fullsize: string
  alt?: string
}

interface BlueskyEmbed {
  $type?: string
  images?: BlueskyImage[]
}

interface BlueskyPost {
  uri: string
  cid: string
  author: BlueskyAuthor
  record: BlueskyRecord
  embed?: {
    $type?: string
    images?: Array<{
      thumb: string
      fullsize: string
      alt?: string
      aspectRatio?: {
        width: number
        height: number
      }
    }>
  }
}


export interface BlueskySearchFeedProps {
  posts: BlueskyPost[]
  className?: string
  compact?: boolean
  title?: string
}

// Helper function to extract post ID from URI
const extractPostId = (uri: string) => uri.split('/').pop()

// Helper function to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 30) return `${diffDay}d ago`

  const month = date.getMonth() + 1
  const day = date.getDate()
  const year = date.getFullYear()
  return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`
}

export default function BlueskySearchFeed({
  posts,
  className = '',
  compact = true,
  title = 'Social Feed'
}: BlueskySearchFeedProps) {

  const postItems = useMemo(() => {
    return posts.map((post, index) => {
      const postId = extractPostId(post.uri)
      const postUrl = `https://bsky.app/profile/${post.author.handle}/post/${postId}`

      return (
        <article
          key={`${post.uri}-${index}`}
          className={index > 0 ? 'pt-6 border-t-2 border-gray-100 dark:border-gray-700' : ''}
          aria-label={`Post by ${post.author.displayName || post.author.handle}`}
        >
          <div className="space-y-4">
            {/* Author header */}
            <div className="flex items-center gap-4">
              {post.author.avatar ? (
                <img
                  src={post.author.avatar}
                  alt=""
                  className={compact ? 'h-10 w-10 rounded-full' : 'h-12 w-12 rounded-full'}
                  loading="lazy"
                />
              ) : (
                <div
                  className={`${
                    compact ? 'h-10 w-10 text-xl' : 'h-12 w-12 text-2xl'
                  } rounded-full bg-brand-cloud-blue dark:bg-brand-cloud-blue text-white flex items-center justify-center font-semibold`}
                  aria-hidden="true"
                >
                  {(post.author.displayName || post.author.handle)[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xl font-medium text-brand-slate-gray dark:text-white truncate">
                  {post.author.displayName || post.author.handle}
                  {!compact && (
                    <span className="ml-2 text-lg text-gray-500 dark:text-gray-400">
                      @{post.author.handle}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Post content */}
            <p className="text-xl leading-relaxed text-brand-slate-gray dark:text-gray-300 whitespace-pre-wrap">
              {post.record.text}
            </p>

            {/* Images if present */}
            {post.embed?.images && post.embed.images.length > 0 && (
              <div className={`grid gap-2 ${post.embed.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {post.embed.images.map((image, imgIndex) => (
                  <img
                    key={imgIndex}
                    src={image.thumb}
                    alt={image.alt || ''}
                    className="rounded-lg w-full h-auto object-cover max-h-96"
                    loading="lazy"
                  />
                ))}
              </div>
            )}

            {/* Post footer */}
            <div className="flex items-center justify-between text-lg text-gray-500 dark:text-gray-400">
              <time dateTime={post.record.createdAt}>
                {formatRelativeTime(post.record.createdAt)}
              </time>
              <a
                href={postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-cloud-blue hover:text-brand-cloud-blue-hover dark:text-blue-400 dark:hover:text-blue-300 focus:ring-2 focus:ring-brand-cloud-blue focus:outline-none"
              >
                View on Bluesky
              </a>
            </div>
          </div>
        </article>
      )
    })
  }, [posts, compact])

  // Empty state - silent failure
  if (posts.length === 0) {
    return null
  }

  // Main render
  return (
    <section
      className={`rounded-lg bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-xl border-2 border-brand-cloud-blue/20 p-8 ${className}`}
      aria-label="Bluesky social feed"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <BlueskyIcon className="h-10 w-10 text-brand-cloud-blue dark:text-blue-400" />
          <h3 className="font-space-grotesk font-semibold text-2xl text-brand-slate-gray dark:text-white">
            {title}
            {posts.length > 1 && (
              <span className="ml-2 text-xl text-gray-500 dark:text-gray-400">
                ({posts.length})
              </span>
            )}
          </h3>
        </div>
      </div>
      <div className="space-y-6">
        {postItems}
      </div>
    </section>
  )
}