import { useState } from 'react'
import { useNotification } from '@/components/admin/NotificationProvider'

export function useSponsorBroadcast() {
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false)
  const { showNotification } = useNotification()

  const handleBroadcastEmail = async (subject: string, message: string) => {
    try {
      const payload = { subject, message }

      const response = await fetch('/admin/api/sponsors/email/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('[SponsorBroadcast] Broadcast request failed:', {
          status: response.status,
          statusText: response.statusText,
          error: data.error,
          details: data.details,
        })

        const errorMessage = data.details
          ? `${data.error}: ${data.details}`
          : data.error || 'Failed to send broadcast email'

        throw new Error(errorMessage)
      }

      setIsBroadcastModalOpen(false)
    } catch (error) {
      console.error('[SponsorBroadcast] Broadcast error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  const handleSyncContacts = async () => {
    try {
      const response = await fetch('/admin/api/sponsors/email/audience/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('[SponsorBroadcast] Sync request failed:', {
          status: response.status,
          statusText: response.statusText,
          error: data.error,
          details: data.details,
          context: data.context,
        })

        const errorMessage = data.details
          ? `${data.error}: ${data.details}`
          : data.error || 'Failed to sync sponsor contacts'

        throw new Error(errorMessage)
      }

      showNotification({
        type: 'success',
        title: 'Contacts Synced',
        message: data.message,
      })
    } catch (error) {
      console.error('[SponsorBroadcast] Sync error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to sync sponsor contacts with email audience'

      showNotification({
        type: 'error',
        title: 'Sync Failed',
        message: errorMessage,
      })
    }
  }

  return {
    isBroadcastModalOpen,
    setIsBroadcastModalOpen,
    handleBroadcastEmail,
    handleSyncContacts,
  }
}
