'use client'

import { GeneralBroadcastModal } from '@/components/admin'
import { useNotification } from './NotificationProvider'
import { api } from '@/lib/trpc/client'

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
  const broadcastMutation = api.speaker.admin.broadcastEmail.useMutation()
  const syncMutation = api.speaker.admin.syncAudience.useMutation()

  const handleSendBroadcast = async (subject: string, message: string) => {
    await broadcastMutation.mutateAsync({ subject, message })
  }

  const handleSyncContacts = async () => {
    try {
      const result = await syncMutation.mutateAsync()

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
      eventDate={formatConferenceDateLong(conference.startDate)}
      eventUrl={`https://${conference.domains[0]}`}
      socialLinks={conference.socialLinks || []}
    />
  )
}
