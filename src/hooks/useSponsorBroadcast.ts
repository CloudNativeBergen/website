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
        throw new Error(data.error || 'Failed to send broadcast email')
      }

      setIsBroadcastModalOpen(false)
    } catch (error) {
      console.error('Failed to send broadcast email:', error)
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
        throw new Error(data.error || 'Failed to sync sponsor contacts')
      }

      showNotification({
        type: 'success',
        title: 'Contacts Synced',
        message: data.message,
      })
    } catch (error) {
      console.error('Failed to sync sponsor contacts:', error)
      showNotification({
        type: 'error',
        title: 'Sync Failed',
        message: 'Failed to sync sponsor contacts with email audience',
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
