import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { searchSpeakers } from '@/lib/speaker/sanity'
import {
  speakerListResponse,
  speakerListResponseError,
} from '@/lib/speaker/server'

export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return speakerListResponseError(
      new Error('Unauthorized'),
      'Access denied',
      'client',
      401,
    )
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  const exclude = searchParams.get('exclude')

  if (!query) {
    return speakerListResponseError(
      new Error('Missing search query'),
      'Search query is required',
      'client',
      400,
    )
  }

  // Parse exclude parameter (comma-separated speaker IDs)
  const excludeSpeakerIds = exclude ? exclude.split(',').filter(Boolean) : []

  const { speakers, err } = await searchSpeakers(query, excludeSpeakerIds)

  if (err) {
    return speakerListResponseError(
      err,
      'Failed to search speakers',
      'server',
      500,
    )
  }

  return speakerListResponse(speakers)
}