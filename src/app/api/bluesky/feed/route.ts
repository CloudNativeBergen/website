import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const handle = searchParams.get('handle');
  const limit = searchParams.get('limit') || '20';

  if (!handle) {
    return NextResponse.json(
      { error: 'Handle is required' },
      { status: 400 }
    );
  }

  const response = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=${limit}`,
    {
      next: { revalidate: 300 },
    }
  );

  // Handle rate limiting and access errors gracefully
  if (response.status === 403 || response.status === 429) {
    console.log(`Bluesky API returned ${response.status}, returning empty feed`);
    return NextResponse.json(
      { feed: [] },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        },
      }
    );
  }

  if (!response.ok) {
    console.error(`Bluesky API error: ${response.status}`);
    return NextResponse.json(
      { feed: [] },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        },
      }
    );
  }

  try {
    const data = await response.json();

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Error parsing Bluesky response:', error);
    return NextResponse.json(
      { feed: [] },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        },
      }
    );
  }
}