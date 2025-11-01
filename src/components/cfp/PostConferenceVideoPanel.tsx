'use client'

import { VideoCameraIcon } from '@heroicons/react/24/outline'
import { VideoEmbed } from '@/components/VideoEmbed'
import { getVideoPlatform } from '@/lib/video/utils'

interface PostConferenceVideoPanelProps {
  videoUrl?: string | null
}

export function PostConferenceVideoPanel({
  videoUrl,
}: PostConferenceVideoPanelProps) {
  if (!videoUrl || !getVideoPlatform(videoUrl)) {
    return null
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 flex items-center text-lg font-semibold text-gray-900 dark:text-white">
        <VideoCameraIcon className="mr-2 h-5 w-5" />
        Recording
      </h3>
      <VideoEmbed url={videoUrl} title="Talk Recording" />
    </div>
  )
}
