/**
 * Extracts YouTube video ID from various YouTube URL formats
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 */
export function extractYouTubeId(url: string): string | null {
  try {
    const urlObj = new URL(url)

    // Handle youtu.be short links
    if (urlObj.hostname === 'youtu.be') {
      return urlObj.pathname.slice(1).split('?')[0]
    }

    // Handle youtube.com links
    if (urlObj.hostname.includes('youtube.com')) {
      // Check for /watch?v= format
      const vParam = urlObj.searchParams.get('v')
      if (vParam) {
        return vParam
      }

      // Check for /embed/ format
      const embedMatch = urlObj.pathname.match(/\/embed\/([^/?]+)/)
      if (embedMatch) {
        return embedMatch[1]
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Extracts Vimeo video ID from Vimeo URL
 * Supports:
 * - https://vimeo.com/VIDEO_ID
 * - https://player.vimeo.com/video/VIDEO_ID
 */
export function extractVimeoId(url: string): string | null {
  try {
    const urlObj = new URL(url)

    if (!urlObj.hostname.includes('vimeo.com')) {
      return null
    }

    // Handle player.vimeo.com
    if (urlObj.pathname.startsWith('/video/')) {
      return urlObj.pathname.split('/')[2]
    }

    // Handle vimeo.com/VIDEO_ID
    const pathParts = urlObj.pathname.split('/').filter(Boolean)
    if (pathParts.length > 0) {
      return pathParts[0]
    }

    return null
  } catch {
    return null
  }
}

/**
 * Determines the video platform from a URL
 */
export function getVideoPlatform(url: string): 'youtube' | 'vimeo' | null {
  try {
    const urlObj = new URL(url)

    if (
      urlObj.hostname.includes('youtube.com') ||
      urlObj.hostname === 'youtu.be'
    ) {
      return 'youtube'
    }

    if (urlObj.hostname.includes('vimeo.com')) {
      return 'vimeo'
    }

    return null
  } catch {
    return null
  }
}
