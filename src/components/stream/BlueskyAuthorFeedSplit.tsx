import BlueskySearchFeed from './BlueskySearchFeed';

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

export interface BlueskyAuthorFeedSplitProps {
  handle: string
  className?: string
  postCount?: number
  compact?: boolean
  title?: string
  startIndex?: number
  endIndex?: number
}

async function fetchBlueskyAuthorPosts(
  handle: string,
  postCount: number
): Promise<BlueskyPost[]> {
  try {
    const params = new URLSearchParams({
      handle,
      limit: postCount.toString(),
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(
      `${baseUrl}/api/bluesky/feed?${params}`,
      {
        next: { revalidate: 300 },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch Bluesky posts: ${response.status}`);
      return [];
    }

    const data = await response.json() as BlueskyFeedResponse;

    if (!data.feed || data.feed.length === 0) {
      return [];
    }

    // Extract posts from feed items and deduplicate by URI
    const posts = data.feed.map(item => item.post);

    // Deduplicate posts by URI
    const uniquePosts = posts.filter((post, index, self) =>
      index === self.findIndex(p => p.uri === post.uri)
    );

    return uniquePosts;
  } catch (error) {
    console.error('Error fetching Bluesky author posts:', error);
    return [];
  }
}

export default async function BlueskyAuthorFeedSplit({
  handle,
  className = '',
  postCount = 10, // Fetch more posts initially
  compact = true,
  title = 'Social Feed',
  startIndex = 0,
  endIndex = 5
}: BlueskyAuthorFeedSplitProps) {
  const posts = await fetchBlueskyAuthorPosts(handle, postCount);

  // Slice the posts based on provided indices
  const slicedPosts = posts.slice(startIndex, endIndex);

  // Don't render anything if no posts in the slice
  if (slicedPosts.length === 0) {
    return null;
  }

  return (
    <BlueskySearchFeed
      posts={slicedPosts}
      className={className}
      compact={compact}
      title={title}
    />
  );
}