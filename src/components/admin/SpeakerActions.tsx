'use client'

import { useState } from 'react'
import { Button } from '@/components/Button'
import { BroadcastEmailModal } from '@/components/admin'
import { useNotification } from './NotificationProvider'
import { EnvelopeIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { PortableTextBlock } from '@portabletext/editor'

interface SpeakerActionsProps {
  eligibleSpeakersCount: number
}

export function SpeakerActions({ eligibleSpeakersCount }: SpeakerActionsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const { showNotification } = useNotification()

  const handleSendBroadcast = async (
    subject: string,
    content: PortableTextBlock[],
  ) => {
    try {
      const response = await fetch('/admin/api/speakers/email/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subject, content }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send broadcast email')
      }

      showNotification({
        type: 'success',
        title: 'Email sent successfully!',
        message: `Email successfully sent to ${result.recipientCount} speakers.`,
      })
    } catch (error: unknown) {
      console.error('Broadcast error:', error)
      throw error // Re-throw to be handled by the modal
    }
  }

  const handleSyncAudience = async () => {
    setSyncLoading(true)
    try {
      const response = await fetch('/admin/api/speakers/email/audience/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync audience')
      }

      showNotification({
        type: 'success',
        title: 'Audience synced successfully!',
        message: `Successfully synced ${result.syncedCount} speakers with the email audience.`,
      })
    } catch (error: unknown) {
      console.error('Sync error:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      showNotification({
        type: 'error',
        title: 'Failed to sync audience',
        message: errorMessage,
      })
    } finally {
      setSyncLoading(false)
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          onClick={handleSyncAudience}
          disabled={syncLoading || eligibleSpeakersCount === 0}
          className="font-space-grotesk flex items-center gap-2 rounded-xl border border-brand-frosted-steel px-4 py-2 text-brand-slate-gray transition-colors duration-200 hover:bg-brand-sky-mist disabled:opacity-50"
        >
          <ArrowPathIcon
            className={`h-4 w-4 ${syncLoading ? 'animate-spin' : ''}`}
          />
          {syncLoading ? 'Syncing...' : 'Sync Audience'}
        </Button>

        <Button
          onClick={() => setIsModalOpen(true)}
          className="font-space-grotesk flex items-center gap-2 rounded-xl bg-brand-cloud-blue px-4 py-2 text-white transition-colors duration-200 hover:bg-primary-700"
          disabled={eligibleSpeakersCount === 0}
        >
          <EnvelopeIcon className="h-4 w-4" />
          Email Speakers
        </Button>
      </div>

      <BroadcastEmailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSend={handleSendBroadcast}
        speakerCount={eligibleSpeakersCount}
      />
    </>
  )
}
