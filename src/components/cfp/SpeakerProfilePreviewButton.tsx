'use client'

import { useState } from 'react'
import { EyeIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import SpeakerProfilePreview from '@/components/SpeakerProfilePreview'
import type { Speaker } from '@/lib/speaker/types'
import type { ProposalExisting } from '@/lib/proposal/types'

export interface SpeakerProfilePreviewButtonProps {
  speaker: Speaker
  talks?: ProposalExisting[]
  buttonText?: string
  buttonClassName?: string
  fetchTalks?: boolean
  conferenceId?: string
}

export default function SpeakerProfilePreviewButton({
  speaker,
  talks,
  buttonText = 'Preview Public Profile',
  buttonClassName = '',
  fetchTalks = !talks,
  conferenceId,
}: SpeakerProfilePreviewButtonProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [confirmedTalks, setConfirmedTalks] = useState<ProposalExisting[]>(
    talks || [],
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePreviewClick = async () => {
    // If talks are already provided, just open the modal
    if (talks) {
      setIsPreviewOpen(true)
      return
    }

    // If fetchTalks is false and no talks provided, just open with empty talks
    if (!fetchTalks) {
      setIsPreviewOpen(true)
      return
    }

    // Fetch talks from API
    setIsLoading(true)
    setError(null)

    try {
      const url = conferenceId
        ? `/api/speaker/confirmed-talks?conferenceId=${conferenceId}`
        : '/api/speaker/confirmed-talks'
      const response = await fetch(url)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(
          errorData.error?.message || 'Failed to fetch confirmed talks',
        )
      }

      const data = await response.json()
      setConfirmedTalks(data.proposals || [])
      setIsPreviewOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRetry = () => {
    setError(null)
    handlePreviewClick()
  }

  return (
    <>
      <button
        type="button"
        onClick={handlePreviewClick}
        disabled={isLoading}
        className={`font-space-grotesk inline-flex items-center rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-cloud-blue/90 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus:outline-blue-500 ${buttonClassName}`}
      >
        {isLoading ? (
          <>
            <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </>
        ) : (
          <>
            <EyeIcon className="mr-2 h-4 w-4" />
            {buttonText}
          </>
        )}
      </button>

      {error && (
        <div className="mt-2 flex items-center justify-between rounded-md bg-red-50 p-3 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="ml-3 text-sm font-medium text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
          >
            Retry
          </button>
        </div>
      )}

      <SpeakerProfilePreview
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        speaker={speaker}
        talks={confirmedTalks}
      />
    </>
  )
}
