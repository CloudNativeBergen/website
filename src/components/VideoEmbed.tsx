'use client'

import {
  extractYouTubeId,
  extractVimeoId,
  getVideoPlatform,
} from '@/lib/video/utils'

interface VideoEmbedProps {
  url: string
  title?: string
  className?: string
}

/**
 * Privacy-preserving video embed component
 *
 * For YouTube:
 * - Uses youtube-nocookie.com domain which doesn't use tracking cookies until playback
 * - No cookies are set until the user interacts with the player
 *
 * For Vimeo:
 * - Uses dnt=1 (Do Not Track) parameter
 * - Disables tracking and analytics
 */
export function VideoEmbed({
  url,
  title = 'Video',
  className = '',
}: VideoEmbedProps) {
  const platform = getVideoPlatform(url)

  if (!platform) {
    return (
      <div
        className={`rounded-lg bg-gray-100 p-4 text-center dark:bg-gray-800 ${className}`}
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Unsupported video URL
        </p>
      </div>
    )
  }

  if (platform === 'youtube') {
    const videoId = extractYouTubeId(url)

    if (!videoId) {
      return (
        <div
          className={`rounded-lg bg-gray-100 p-4 text-center dark:bg-gray-800 ${className}`}
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Invalid YouTube URL
          </p>
        </div>
      )
    }

    return (
      <div
        className={`relative overflow-hidden rounded-lg ${className}`}
        style={{ paddingBottom: '56.25%' }}
      >
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute top-0 left-0 h-full w-full border-0"
          loading="lazy"
        />
      </div>
    )
  }

  if (platform === 'vimeo') {
    const videoId = extractVimeoId(url)

    if (!videoId) {
      return (
        <div
          className={`rounded-lg bg-gray-100 p-4 text-center dark:bg-gray-800 ${className}`}
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Invalid Vimeo URL
          </p>
        </div>
      )
    }

    return (
      <div
        className={`relative overflow-hidden rounded-lg ${className}`}
        style={{ paddingBottom: '56.25%' }}
      >
        <iframe
          src={`https://player.vimeo.com/video/${videoId}?dnt=1`}
          title={title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute top-0 left-0 h-full w-full border-0"
          loading="lazy"
        />
      </div>
    )
  }

  return null
}
