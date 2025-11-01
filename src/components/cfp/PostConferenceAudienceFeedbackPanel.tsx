'use client'

import { ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline'
import { AudienceFeedback } from '@/lib/proposal/types'

interface PostConferenceAudienceFeedbackPanelProps {
  audienceFeedback?: AudienceFeedback | null
}

export function PostConferenceAudienceFeedbackPanel({
  audienceFeedback,
}: PostConferenceAudienceFeedbackPanelProps) {
  const totalFeedback = audienceFeedback
    ? audienceFeedback.greenCount +
      audienceFeedback.yellowCount +
      audienceFeedback.redCount
    : 0

  if (!audienceFeedback || totalFeedback === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 flex items-center text-lg font-semibold text-gray-900 dark:text-white">
        <ChatBubbleBottomCenterTextIcon className="mr-2 h-5 w-5" />
        Audience Feedback
      </h3>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Thank you for presenting! Attendees shared their feedback using colored
        cards during your session.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-green-50 p-4 text-center dark:bg-green-900/20">
          <div className="text-3xl font-bold text-green-700 dark:text-green-400">
            {audienceFeedback.greenCount}
          </div>
          <div className="mt-1 text-xs text-green-600 dark:text-green-500">
            Positive
          </div>
        </div>
        <div className="rounded-lg bg-yellow-50 p-4 text-center dark:bg-yellow-900/20">
          <div className="text-3xl font-bold text-yellow-700 dark:text-yellow-400">
            {audienceFeedback.yellowCount}
          </div>
          <div className="mt-1 text-xs text-yellow-600 dark:text-yellow-500">
            Neutral
          </div>
        </div>
        <div className="rounded-lg bg-red-50 p-4 text-center dark:bg-red-900/20">
          <div className="text-3xl font-bold text-red-700 dark:text-red-400">
            {audienceFeedback.redCount}
          </div>
          <div className="mt-1 text-xs text-red-600 dark:text-red-500">
            Constructive
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        Total responses: {totalFeedback}
      </p>
    </div>
  )
}
