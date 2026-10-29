'use client'

import { useState } from 'react'
import {
  DocumentArrowDownIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline'
import { Conference } from '@/lib/conference/types'
import { SponsorEmailAction } from './SponsorEmailAction'
import { AdminHeaderActions } from '@/components/admin/AdminHeaderActions'
import { useNotification } from '@/components/admin/NotificationProvider'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import {
  buildContactsCsv,
  contactEmails,
  contactsCsvFilename,
} from '@/lib/sponsor-crm/contacts-csv'

interface SponsorContactActionsProps {
  /** Rows currently shown by the table — exactly what "Export" writes out. */
  visibleSponsors: SponsorForConferenceExpanded[]
  conference: Conference
}

export function SponsorContactActions({
  visibleSponsors,
  conference,
}: SponsorContactActionsProps) {
  const [isExporting, setIsExporting] = useState(false)
  const { showNotification } = useNotification()

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

  const visibleEmails = contactEmails(visibleSponsors)

  const copyEmails = async () => {
    try {
      await navigator.clipboard.writeText(visibleEmails.join(', '))
      showNotification({
        type: 'success',
        title: 'Emails copied',
        message: `${visibleEmails.length} address${
          visibleEmails.length === 1 ? '' : 'es'
        } copied to the clipboard.`,
      })
    } catch (error) {
      console.error('[SponsorContactActions] Copy failed:', error)
      showNotification({
        type: 'error',
        title: 'Copy failed',
        message: 'Could not write to the clipboard. Use Export instead.',
      })
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
            label: `Copy Emails (${visibleEmails.length})`,
            onClick: copyEmails,
            icon: <ClipboardDocumentIcon className="h-4 w-4" />,
            variant: 'secondary',
            disabled: visibleEmails.length === 0,
          },
        ]}
      />

      <SponsorEmailAction conference={conference} />
    </>
  )
}
