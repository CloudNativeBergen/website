export interface BlueskyAuthor {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

export interface BlueskyRecord {
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

export interface BlueskyPost {
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

export interface BlueskyPostItemProps {
  post: BlueskyPost
  variant?: 'compact' | 'default' | 'large'
  showBorder?: boolean
  className?: string
}

export function formatRelativeTime(dateString: string): string {
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

export function extractPostId(uri: string): string {
  return uri.split('/').pop() || ''
}

export function BlueskyPostItem({
  post,
  variant = 'default',
  showBorder = true,
  className = '',
}: BlueskyPostItemProps) {
  const postId = extractPostId(post.uri)
  const postUrl = `https://bsky.app/profile/${post.author.handle}/post/${postId}`
  const relativeTime = formatRelativeTime(post.record.createdAt)

  const sizes = {
    compact: {
      avatar: 'h-5 w-5',
      avatarText: 'text-[10px]',
      name: 'text-xs',
      handle: 'text-xs',
      content: 'text-sm',
      time: 'text-xs',
      spacing: 'space-y-2',
      gap: 'gap-1.5',
      padding: showBorder ? 'pt-3' : '',
    },
    default: {
      avatar: 'h-6 w-6',
      avatarText: 'text-xs',
      name: 'text-sm',
      handle: 'text-xs',
      content: 'text-sm',
      time: 'text-xs',
      spacing: 'space-y-3',
      gap: 'gap-2',
      padding: showBorder ? 'pt-3' : '',
    },
    large: {
      avatar: 'h-16 w-16',
      avatarText: 'text-2xl',
      name: 'text-2xl',
      handle: 'text-xl',
      content: 'text-2xl',
      time: 'text-xl',
      spacing: 'space-y-5',
      gap: 'gap-5',
      padding: showBorder ? 'pt-8' : '',
    },
  }

  const size = sizes[variant]
  const borderClass =
    showBorder && variant === 'large'
      ? 'border-t-2 border-gray-100 dark:border-gray-700'
      : showBorder
        ? 'border-t border-gray-100 dark:border-gray-700'
        : ''

  const contentText =
    variant === 'compact' && post.record.text.length > 140
      ? `${post.record.text.substring(0, 140)}...`
      : post.record.text

  return (
    <article
      className={`${size.spacing} ${borderClass} ${size.padding} ${className}`}
      aria-label={`Post by ${post.author.displayName || post.author.handle}`}
    >
      {/* Author header */}
      <header className={`flex items-center ${size.gap}`}>
        {post.author.avatar ? (
          <img
            src={post.author.avatar}
            alt=""
            className={`${size.avatar} rounded-full object-cover`}
            loading="lazy"
          />
        ) : (
          <div
            className={`${size.avatar} flex items-center justify-center rounded-full bg-linear-to-br from-blue-400 to-blue-600`}
            aria-hidden="true"
          >
            <span className={`${size.avatarText} font-medium text-white`}>
              {(post.author.displayName || post.author.handle)
                .charAt(0)
                .toUpperCase()}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3
            className={`${size.name} truncate font-medium text-gray-900 dark:text-white`}
          >
            {post.author.displayName || post.author.handle}
          </h3>
          {variant !== 'compact' && (
            <p className={`${size.handle} text-gray-500 dark:text-gray-400`}>
              @{post.author.handle}
            </p>
          )}
        </div>
      </header>

      {/* Post content */}
      <div
        className={`${size.content} leading-relaxed whitespace-pre-wrap text-gray-700 dark:text-gray-300`}
      >
        {contentText}
      </div>

      {/* Images if present */}
      {post.embed?.images && post.embed.images.length > 0 && (
        <div
          className={`grid gap-2 ${
            post.embed.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          } ${variant === 'large' ? 'max-w-2xl' : ''}`}
        >
          {post.embed.images.map((image, imgIndex) => (
            <img
              key={imgIndex}
              src={image.thumb}
              alt={image.alt || ''}
              className={`h-auto w-full rounded-lg ${
                variant === 'large'
                  ? 'object-contain'
                  : variant === 'default'
                    ? 'max-h-48 object-cover'
                    : 'max-h-32 object-cover'
              }`}
              loading="lazy"
            />
          ))}
        </div>
      )}

      {/* Post footer */}
      <footer
        className={`${size.time} flex items-center justify-between text-gray-500 dark:text-gray-400`}
      >
        <time
          dateTime={post.record.createdAt}
          title={new Date(post.record.createdAt).toLocaleString()}
        >
          {relativeTime}
        </time>
        {variant !== 'large' && (
          <a
            href={postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded font-medium text-blue-500 hover:text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none dark:text-blue-400 dark:hover:text-blue-300 dark:focus:ring-offset-gray-800"
            aria-label={`View post by ${post.author.displayName || post.author.handle} on Bluesky`}
          >
            {variant === 'compact' ? 'View' : 'View on Bluesky'}
          </a>
        )}
      </footer>
    </article>
  )
}
