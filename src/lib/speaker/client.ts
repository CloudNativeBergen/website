import { Speaker } from '@/lib/speaker/types'

export async function searchSpeakers(query: string): Promise<{
  speakers: Speaker[]
  error?: { message: string; type: string }
}> {
  try {
    const response = await fetch(
      `/api/speakers/search?q=${encodeURIComponent(query)}`,
    )

    if (!response.ok) {
      const errorData = await response.json()
      return {
        speakers: [],
        error: {
          message: errorData.message || 'Failed to search speakers',
          type: 'search_error',
        },
      }
    }

    const data = await response.json()
    return {
      speakers: data.speakers || [],
    }
  } catch {
    return {
      speakers: [],
      error: {
        message: 'Network error while searching speakers',
        type: 'network_error',
      },
    }
  }
}
