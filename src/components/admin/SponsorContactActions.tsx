'use client'

import { useState } from 'react'
import {
  EnvelopeIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline'
import { Conference } from '@/lib/conference/types'
import { GeneralBroadcastModal } from '@/components/admin'
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
      // This would typically call an API endpoint to generate the export
      // For now, we'll just simulate it
      console.log('Exporting sponsor contacts...')

      // Simulate export delay
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // In a real implementation, this would trigger a download
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
      <div className="flex items-center gap-3">
        <button
          onClick={exportSponsorContacts}
          disabled={sponsorsWithContactsCount === 0 || isExporting}
          className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <DocumentArrowDownIcon className="h-4 w-4" />
          {isExporting ? 'Exporting...' : 'Export Contacts'}
        </button>

        <button
          onClick={() => setIsBroadcastModalOpen(true)}
          disabled={sponsorsWithContactsCount === 0}
          className="inline-flex items-center gap-2 rounded-md bg-brand-cloud-blue px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-cloud-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <EnvelopeIcon className="h-4 w-4" />
          Send Broadcast ({sponsorsWithContactsCount})
        </button>
      </div>

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
        eventDate={new Date(conference.start_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
        eventUrl={`https://${conference.domains[0]}`}
        socialLinks={conference.social_links || []}
      />
    </>
  )
}
