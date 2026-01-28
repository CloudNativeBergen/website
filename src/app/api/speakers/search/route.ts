import { NextRequest, NextResponse } from 'next/server'
import { clientReadUncached as clientRead } from '@/lib/sanity/client'
import { Speaker } from '@/lib/speaker/types'
import { unstable_noStore as noStore } from 'next/cache'

export async function GET(request: NextRequest) {
  noStore()
  try {
    const { searchParams } = new URL(request.url)
    const searchQuery = searchParams.get('q')

    if (!searchQuery || searchQuery.trim().length < 2) {
      return NextResponse.json({
        speakers: [],
        message: 'Query must be at least 2 characters long',
      })
    }

    const speakers: Speaker[] = await clientRead.fetch(
      `*[_type == "speaker" && (name match $searchQuery || email match $searchQuery || title match $searchQuery)] | order(name asc) [0...20] {
        _id,
        name,
        email,
        title,
        bio,
        "image": image.asset->url,
        "slug": slug.current,
        flags
      }`,
      { searchQuery: `*${searchQuery}*` },
      { cache: 'no-store' },
    )

    return NextResponse.json({
      speakers,
      status: 200,
    })
  } catch (error) {
    console.error('Error searching speakers:', error)
    return NextResponse.json(
      {
        speakers: [],
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
