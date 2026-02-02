import BlueskySearchFeedLooping from './BlueskySearchFeedLooping'
import type { BlueskyPost } from '@/components/BlueskyPostItem'

interface BlueskyFeedItem {
  post: BlueskyPost
}

interface BlueskyFeedResponse {
  feed: BlueskyFeedItem[]
}

interface BlueskySearchResponse {
  posts: BlueskyPost[]
}

export interface BlueskyAuthorFeedLoopingProps {
  handle: string
  className?: string
  compact?: boolean
  title?: string
  speed?: number
  maxHeight?: string
}

async function fetchBlueskyPosts(handle: string): Promise<BlueskyPost[]> {
  try {
    const fetchOptions = { next: { revalidate: 300 } }

    // Fetch from three sources in parallel
    const [authorResponse, mentionsResponse, hashtagResponse] =
      await Promise.allSettled([
        // 1. Author's own posts
        fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=30`,
          fetchOptions,
        ),
        // 2. Posts mentioning the account
        fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(`@${handle}`)}&limit=30&sort=latest`,
          fetchOptions,
        ),
        // 3. Posts with hashtag #cndb2025
        // @TODO make this configurable per event
        fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent('#cndb2025')}&limit=30&sort=latest`,
          fetchOptions,
        ),
      ])

    const allPosts: BlueskyPost[] = []

    // Process author feed
    if (authorResponse.status === 'fulfilled') {
      if (
        authorResponse.value.ok &&
        authorResponse.value.status !== 403 &&
        authorResponse.value.status !== 429
      ) {
        const data = (await authorResponse.value.json()) as BlueskyFeedResponse
        if (data.feed?.length) {
          allPosts.push(...data.feed.map((item) => item.post))
          console.log(`✓ Fetched ${data.feed.length} author posts`)
        } else {
          console.log('✗ No author posts in response')
        }
      } else {
        console.log(
          `✗ Author feed request failed: ${authorResponse.value.status}`,
        )
      }
    } else {
      console.log(`✗ Author feed request rejected:`, authorResponse.reason)
    }

    // Process mentions
    if (mentionsResponse.status === 'fulfilled') {
      if (
        mentionsResponse.value.ok &&
        mentionsResponse.value.status !== 403 &&
        mentionsResponse.value.status !== 429
      ) {
        const data =
          (await mentionsResponse.value.json()) as BlueskySearchResponse
        if (data.posts?.length) {
          allPosts.push(...data.posts)
          console.log(`✓ Fetched ${data.posts.length} mentions`)
        } else {
          console.log('✗ No mentions found')
        }
      } else {
        console.log(
          `✗ Mentions request failed: ${mentionsResponse.value.status}`,
        )
      }
    } else {
      console.log(`✗ Mentions request rejected:`, mentionsResponse.reason)
    }

    // Process hashtag posts
    if (hashtagResponse.status === 'fulfilled') {
      if (
        hashtagResponse.value.ok &&
        hashtagResponse.value.status !== 403 &&
        hashtagResponse.value.status !== 429
      ) {
        const data =
          (await hashtagResponse.value.json()) as BlueskySearchResponse
        if (data.posts?.length) {
          allPosts.push(...data.posts)
          console.log(`✓ Fetched ${data.posts.length} hashtag posts`)
        } else {
          console.log('✗ No hashtag posts found')
        }
      } else {
        console.log(`✗ Hashtag request failed: ${hashtagResponse.value.status}`)
      }
    } else {
      console.log(`✗ Hashtag request rejected:`, hashtagResponse.reason)
    }

    if (allPosts.length === 0) {
      console.log('No posts found from any source')
      return []
    }

    console.log(`Fetched ${allPosts.length} total posts from all sources`)

    // Deduplicate posts by URI first
    const uniquePosts = allPosts.filter(
      (post, index, self) =>
        index === self.findIndex((p) => p.uri === post.uri),
    )

    console.log(`After deduplication: ${uniquePosts.length} unique posts`)

    // Sort posts newest to oldest
    const sortedPosts = uniquePosts.sort((a, b) => {
      const dateA = new Date(a.record.createdAt)
      const dateB = new Date(b.record.createdAt)
      return dateB.getTime() - dateA.getTime() // Newest first
    })

    // Filter posts from the last 7 days (very lenient for event feed)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const recentPosts = sortedPosts.filter((post) => {
      const postDate = new Date(post.record.createdAt)
      return postDate >= sevenDaysAgo
    })

    console.log(`Found ${recentPosts.length} posts from the last 7 days`)

    // If we have recent posts, return them, otherwise return all sorted posts
    if (recentPosts.length > 0) {
      return recentPosts
    }

    console.log('No recent posts, returning all sorted posts')
    return sortedPosts.slice(0, 30) // Return top 30 posts
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
  const posts = await fetchBlueskyPosts(handle)

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
