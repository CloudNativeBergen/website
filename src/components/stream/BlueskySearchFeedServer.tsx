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
}

interface BlueskyPost {
  uri: string
  cid: string
  author: BlueskyAuthor
  record: BlueskyRecord
}

interface BlueskySearchResponse {
  posts: BlueskyPost[]
  cursor?: string
}

export interface BlueskySearchFeedServerProps {
  searchQuery: string
  className?: string
  postCount?: number
  compact?: boolean
  title?: string
}

async function fetchBlueskySearchPosts(
  searchQuery: string,
  postCount: number
): Promise<BlueskyPost[]> {
  try {
    const params = new URLSearchParams({
      q: searchQuery,
      limit: postCount.toString(),
      sort: 'latest',
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(
      `${baseUrl}/api/bluesky/search?${params}`,
      {
        next: { revalidate: 300 },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch Bluesky posts: ${response.status}`);
      return [];
    }

    const data = await response.json() as BlueskySearchResponse;
    return data.posts || [];
  } catch (error) {
    console.error('Error fetching Bluesky search posts:', error);
    return [];
  }
}

export default async function BlueskySearchFeedServer({
  searchQuery,
  className = '',
  postCount = 5,
  compact = true,
  title = 'Social Feed'
}: BlueskySearchFeedServerProps) {
  const posts = await fetchBlueskySearchPosts(searchQuery, postCount);

  // Don't render anything if no posts
  if (posts.length === 0) {
    return null;
  }

  return (
    <BlueskySearchFeed
      posts={posts}
      className={className}
      compact={compact}
      title={title}
    />
  );
}