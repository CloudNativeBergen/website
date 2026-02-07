'use client'

import { GeneralBroadcastModal } from '@/components/admin'
import { useNotification } from './NotificationProvider'

import { Conference } from '@/lib/conference/types'
import { formatConferenceDateLong } from '@/lib/time'

interface SpeakerActionsProps {
  eligibleSpeakersCount: number
  fromEmail: string
  conference: Conference
  isModalOpen: boolean
  setIsModalOpen: (open: boolean) => void
}

export function SpeakerActions({
  eligibleSpeakersCount,
  fromEmail,
  conference,
  isModalOpen,
  setIsModalOpen,
}: SpeakerActionsProps) {
  const { showNotification } = useNotification()

  const handleSendBroadcast = async (subject: string, message: string) => {
    try {
      const response = await fetch('/admin/api/speakers/email/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subject, message }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send broadcast email')
      }
    } catch (error: unknown) {
      console.error('Broadcast error:', error)
      throw error
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
    <GeneralBroadcastModal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      onSend={handleSendBroadcast}
      onSyncContacts={handleSyncContacts}
      recipientCount={eligibleSpeakersCount}
      recipientType="speakers"
      fromEmail={fromEmail}
      eventName={conference.title}
      eventLocation={`${conference.city}, ${conference.country}`}
      eventDate={formatConferenceDateLong(conference.start_date)}
      eventUrl={`https://${conference.domains[0]}`}
      socialLinks={conference.social_links || []}
    />
  )
}
