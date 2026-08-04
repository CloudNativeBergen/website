'use client'

import { useState } from 'react'
import {
  EnvelopeIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline'
import { Conference } from '@/lib/conference/types'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { formatConferenceDateLong } from '@/lib/time'
import { GeneralBroadcastModal } from '@/components/admin'
import { AdminHeaderActions } from '@/components/admin/AdminHeaderActions'
import { useNotification } from '@/components/admin/NotificationProvider'
import { useSponsorBroadcast } from '@/hooks/useSponsorBroadcast'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import {
  buildContactsCsv,
  contactsCsvFilename,
} from '@/lib/sponsor-crm/contacts-csv'

interface SponsorContactActionsProps {
  /** Rows currently shown by the table — exactly what "Export" writes out. */
  visibleSponsors: SponsorForConferenceExpanded[]
  /**
   * Distinct contact addresses across the WHOLE conference roster. The
   * broadcast goes to the synced sponsor audience, which is built from every
   * sponsor's contacts regardless of the filters applied to this page, so the
   * count must not be derived from the visible rows.
   */
  broadcastRecipientCount: number
  fromEmail: string
  conference: Conference
}

export function SponsorContactActions({
  visibleSponsors,
  broadcastRecipientCount,
  fromEmail,
  conference,
}: SponsorContactActionsProps) {
  const [isExporting, setIsExporting] = useState(false)
  const { showNotification } = useNotification()
  const {
    isBroadcastModalOpen,
    setIsBroadcastModalOpen,
    handleBroadcastEmail,
    handleSyncContacts,
  } = useSponsorBroadcast()

  const exportSponsorContacts = () => {
    setIsExporting(true)
    try {
      const csv = buildContactsCsv(visibleSponsors)
      const url = URL.createObjectURL(
        new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = contactsCsvFilename(conference.title)
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      showNotification({
        type: 'success',
        title: 'Contacts exported',
        message: `${visibleSponsors.length} sponsor${
          visibleSponsors.length === 1 ? '' : 's'
        } written to ${contactsCsvFilename(conference.title)}.`,
      })
    } catch (error) {
      console.error('[SponsorContactActions] Export failed:', error)
      showNotification({
        type: 'error',
        title: 'Export failed',
        message: 'Could not generate the CSV file. Please try again.',
      })
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
            disabled: visibleSponsors.length === 0 || isExporting,
          },
          {
            label: `Send Broadcast (${broadcastRecipientCount})`,
            onClick: () => setIsBroadcastModalOpen(true),
            icon: <EnvelopeIcon className="h-4 w-4" />,
            disabled: broadcastRecipientCount === 0,
          },
        ]}
      />

      <GeneralBroadcastModal
        isOpen={isBroadcastModalOpen}
        onClose={() => setIsBroadcastModalOpen(false)}
        onSend={handleBroadcastEmail}
        onSyncContacts={handleSyncContacts}
        recipientCount={broadcastRecipientCount}
        recipientType="sponsor contacts"
        fromEmail={fromEmail}
        eventName={conference.title}
        eventLocation={[conference.city, conference.country]
          .filter(Boolean)
          .join(', ')}
        eventDate={formatConferenceDateLong(conference.startDate)}
        eventUrl={conferenceBaseUrl(conference)}
        socialLinks={conference.socialLinks || []}
      />
    </>
  )
}
