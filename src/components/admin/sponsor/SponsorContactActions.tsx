'use client'

import { useState } from 'react'
import {
  EnvelopeIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline'
import { Conference } from '@/lib/conference/types'
import { formatConferenceDateLong } from '@/lib/time'
import { GeneralBroadcastModal } from '@/components/admin'
import { AdminHeaderActions } from '@/components/admin/AdminHeaderActions'
import { useSponsorBroadcast } from '@/hooks/useSponsorBroadcast'

interface SponsorContactActionsProps {
  sponsorsWithContactsCount: number
  fromEmail: string
  conference: Conference
}

export function SponsorContactActions({
  sponsorsWithContactsCount,
  fromEmail,
  conference,
}: SponsorContactActionsProps) {
  const [isExporting, setIsExporting] = useState(false)
  const {
    isBroadcastModalOpen,
    setIsBroadcastModalOpen,
    handleBroadcastEmail,
    handleSyncContacts,
  } = useSponsorBroadcast()

  const exportSponsorContacts = async () => {
    setIsExporting(true)
    try {
      console.log('Exporting sponsor contacts...')

      await new Promise((resolve) => setTimeout(resolve, 1000))

      alert('Export functionality would be implemented here')
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <>
      <AdminHeaderActions
        items={[
          {
            label: isExporting ? 'Exporting...' : 'Export Contacts',
            onClick: exportSponsorContacts,
            icon: <DocumentArrowDownIcon className="h-4 w-4" />,
            variant: 'secondary',
            disabled: sponsorsWithContactsCount === 0 || isExporting,
          },
          {
            label: `Send Broadcast (${sponsorsWithContactsCount})`,
            onClick: () => setIsBroadcastModalOpen(true),
            icon: <EnvelopeIcon className="h-4 w-4" />,
            disabled: sponsorsWithContactsCount === 0,
          },
        ]}
      />

      <GeneralBroadcastModal
        isOpen={isBroadcastModalOpen}
        onClose={() => setIsBroadcastModalOpen(false)}
        onSend={handleBroadcastEmail}
        onSyncContacts={handleSyncContacts}
        recipientCount={sponsorsWithContactsCount}
        recipientType="sponsors"
        fromEmail={fromEmail}
        eventName={conference.title}
        eventLocation={`${conference.city}, ${conference.country}`}
        eventDate={formatConferenceDateLong(conference.start_date)}
        eventUrl={`https://${conference.domains[0]}`}
        socialLinks={conference.social_links || []}
      />
    </>
  )
}
