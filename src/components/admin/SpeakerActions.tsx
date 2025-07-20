'use client'

import { useState } from 'react'
import { Button } from '@/components/Button'
import { BroadcastEmailModal } from '@/components/admin'
import { useNotification } from './NotificationProvider'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { PortableTextBlock } from '@portabletext/editor'

interface SpeakerActionsProps {
  eligibleSpeakersCount: number
}

export function SpeakerActions({ eligibleSpeakersCount }: SpeakerActionsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
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

  const handleSyncContacts = async () => {
    try {
      const response = await fetch('/admin/api/speakers/email/audience/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync contacts')
      }

      showNotification({
        type: 'success',
        title: 'Contacts synced successfully!',
        message: `Successfully synced ${result.syncedCount} speakers with the email contacts.`,
      })
    } catch (error: unknown) {
      console.error('Sync error:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      showNotification({
        type: 'error',
        title: 'Failed to sync contacts',
        message: errorMessage,
      })
    }
  }

  return (
    <>
      <div className="flex gap-3">
        <Button
          onClick={() => setIsModalOpen(true)}
          variant="primary"
          size="md"
          className="font-space-grotesk flex items-center gap-2 rounded-xl transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
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
        onSyncContacts={handleSyncContacts}
        speakerCount={eligibleSpeakersCount}
      />
    </>
  )
}
