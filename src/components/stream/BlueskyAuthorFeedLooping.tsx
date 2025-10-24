import BlueskySearchFeedLooping from './BlueskySearchFeedLooping'

interface BlueskyAuthor {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

interface BlueskyRecord {
  text: string
  createdAt: string
  embed?: {
    $type?: string
    images?: Array<{
      thumb: string
      fullsize: string
      alt?: string
    }>
  }
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

interface BlueskyFeedItem {
  post: BlueskyPost
}

interface BlueskyFeedResponse {
  feed: BlueskyFeedItem[]
}

export interface BlueskyAuthorFeedLoopingProps {
  handle: string
  className?: string
  compact?: boolean
  title?: string
  speed?: number
  maxHeight?: string
}

async function fetchBlueskyAuthorPosts(handle: string): Promise<BlueskyPost[]> {
  try {
    // Call Bluesky API directly from server component
    const response = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=50`,
      {
        next: { revalidate: 300 },
      },
    )

    // Handle rate limiting and access errors gracefully
    if (response.status === 403 || response.status === 429) {
      console.log(`Bluesky API returned ${response.status}, returning empty feed`)
      return []
    }

    if (!response.ok) {
      console.error(`Failed to fetch Bluesky posts: ${response.status}`)
      return []
    }

    const data = (await response.json()) as BlueskyFeedResponse

    if (!data.feed || data.feed.length === 0) {
      console.log('No feed data returned')
      return []
    }

    // Extract posts from feed items
    const posts = data.feed.map((item) => item.post)
    console.log(`Fetched ${posts.length} total posts`)

    // Filter posts from the last 24 hours (more lenient)
    const twentyFourHoursAgo = new Date()
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

    const recentPosts = posts.filter((post) => {
      const postDate = new Date(post.record.createdAt)
      return postDate >= twentyFourHoursAgo
    })

    console.log(`Found ${recentPosts.length} posts from the last 24 hours`)

    // Sort posts newest to oldest
    const sortedPosts = recentPosts.sort((a, b) => {
      const dateA = new Date(a.record.createdAt)
      const dateB = new Date(b.record.createdAt)
      return dateB.getTime() - dateA.getTime() // Newest first
    })

    // Deduplicate posts by URI
    const uniquePosts = sortedPosts.filter(
      (post, index, self) =>
        index === self.findIndex((p) => p.uri === post.uri),
    )

    // If no recent posts, just return all posts sorted
    if (uniquePosts.length === 0 && posts.length > 0) {
      console.log('No recent posts, returning all posts')
      return posts
        .sort((a, b) => {
          const dateA = new Date(a.record.createdAt)
          const dateB = new Date(b.record.createdAt)
          return dateB.getTime() - dateA.getTime()
        })
        .slice(0, 20) // Return top 20 posts
    }

    return uniquePosts
  } catch (error) {
    console.error('Error fetching Bluesky author posts:', error)
    return []
  }
}

export default async function BlueskyAuthorFeedLooping({
  handle,
  className = '',
  compact = true,
  title = 'Social Feed',
  speed = 30,
  maxHeight = '600px',
}: BlueskyAuthorFeedLoopingProps) {
  const posts = await fetchBlueskyAuthorPosts(handle)

  // Don't render anything if no posts
  if (posts.length === 0) {
    return null
  }

  return (
    <BlueskySearchFeedLooping
      posts={posts}
      className={className}
      compact={compact}
      title={title}
      speed={speed}
      maxHeight={maxHeight}
    />
  )
}
