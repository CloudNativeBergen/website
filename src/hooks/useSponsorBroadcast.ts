import { useState } from 'react'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'

export function useSponsorBroadcast() {
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false)
  const { showNotification } = useNotification()
  const broadcastMutation = api.sponsor.crm.broadcastEmail.useMutation()
  const syncMutation = api.sponsor.crm.syncAudience.useMutation()

  const handleBroadcastEmail = async (subject: string, message: string) => {
    await broadcastMutation.mutateAsync({ subject, message })
  }

  const handleSyncContacts = async () => {
    try {
      const data = await syncMutation.mutateAsync()

      showNotification({
        type: 'success',
        title: 'Contacts Synced',
        message: data.message,
      })
    } catch (error) {
      console.error('[SponsorBroadcast] Sync error:', {
        error: error instanceof Error ? error.message : String(error),
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
