import { Speaker } from '@/lib/speaker/types'

/**
 * Search for speakers by name or email
 */
export async function searchSpeakers(
  query: string,
  excludeSpeakerIds: string[] = [],
): Promise<Speaker[]> {
  const params = new URLSearchParams({
    q: query,
  })

  if (excludeSpeakerIds.length > 0) {
    params.append('exclude', excludeSpeakerIds.join(','))
  }

  const response = await fetch(`/api/speaker/search?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to search speakers')
  }

  return data.speakers || []
}