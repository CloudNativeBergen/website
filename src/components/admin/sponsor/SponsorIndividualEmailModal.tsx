'use client'

import { useState, useEffect } from 'react'
import { useNotification, EmailModal } from '@/components/admin'
import { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { BroadcastTemplate } from '@/components/email/BroadcastTemplate'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { PortableTextBlock } from '@portabletext/editor'
import { PortableTextBlock as PortableTextBlockForHTML } from '@portabletext/types'
import { formatConferenceDateLong } from '@/lib/time'
import { createLocalhostWarning } from '@/lib/localhost-warning'

interface SponsorIndividualEmailModalProps {
  isOpen: boolean
  onClose: () => void
  sponsorForConference: SponsorForConferenceExpanded
  domain: string
  fromEmail: string
  conference: {
    title: string
    city: string
    country: string
    start_date: string
    domains: string[]
    social_links?: string[]
  }
}

export function SponsorIndividualEmailModal({
  isOpen,
  onClose,
  sponsorForConference,
  domain,
  fromEmail,
  conference,
}: SponsorIndividualEmailModalProps) {
  const { showNotification } = useNotification()
  const [initialMessage, setInitialMessage] = useState<PortableTextBlock[]>([])

  const contacts = sponsorForConference.contact_persons || []

  useEffect(() => {
    if (isOpen) {
      const greeting = `Dear ${sponsorForConference.sponsor.name} team,\n\n`
      const portableTextBlocks = convertStringToPortableTextBlocks(greeting)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize message template on modal open
      setInitialMessage(portableTextBlocks)
    }
  }, [isOpen, sponsorForConference.sponsor.name])

  const getDefaultSubject = () => {
    const status = sponsorForConference.status
    const contractStatus = sponsorForConference.contract_status
    const invoiceStatus = sponsorForConference.invoice_status
    const title = conference.title

    // Priority for transactional states if closed-won
    if (status === 'closed-won') {
      if (invoiceStatus === 'sent' || invoiceStatus === 'overdue') {
        return `Sponsorship Invoice: ${title}`
      }
      if (contractStatus === 'contract-sent') {
        return `Sponsorship Contract: ${title}`
      }
      return `Sponsorship for ${title} - Next steps`
    }

    switch (status) {
      case 'prospect':
        return `Partnership opportunity: ${title}`
      case 'contacted':
        return `Following up: Sponsorship for ${title}`
      case 'negotiating':
        return `Sponsorship proposal - ${title}`
      default:
        return `Regarding your sponsorship for ${title}`
    }
  }

  const defaultSubject = getDefaultSubject()

  const handleSend = async ({
    subject,
    message,
  }: {
    subject: string
    message: PortableTextBlock[]
  }) => {
    try {
      const messageJSON = JSON.stringify(message as PortableTextBlockForHTML[])

      const response = await fetch('/admin/api/sponsors/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sponsorId: sponsorForConference.sponsor._id,
          subject,
          message: messageJSON,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        showNotification({
          type: 'error',
          title: 'Email failed',
          message: errorData.error || 'Failed to send email',
        })
        return
      }

      const result = await response.json()

      showNotification({
        type: 'success',
        title: 'Email sent successfully',
        message: `Sent to ${result.recipientCount} contact${result.recipientCount > 1 ? 's' : ''} for ${sponsorForConference.sponsor.name}`,
      })
      onClose()
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Network error',
        message:
          err instanceof Error ? err.message : 'An unexpected error occurred',
      })
    }
  }

  const localhostWarning = createLocalhostWarning(domain, 'sponsors')

  const createPreview = ({
    subject,
    messageHTML,
  }: {
    subject: string
    messageHTML: string
  }) => {
    return (
      <BroadcastTemplate
        subject={subject}
        eventName={conference.title}
        eventLocation={`${conference.city}, ${conference.country}`}
        eventDate={formatConferenceDateLong(conference.start_date)}
        eventUrl={`https://${conference.domains[0]}`}
        socialLinks={conference.social_links || []}
        content={<div dangerouslySetInnerHTML={{ __html: messageHTML }} />}
      />
    )
  }

  const recipientDisplay =
    contacts.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {contacts.map((contact, index) => (
          <span
            key={index}
            className="font-inter rounded-full bg-brand-sky-mist px-3 py-1 text-sm text-brand-slate-gray dark:bg-gray-700 dark:text-gray-300"
          >
            {contact.name} &lt;{contact.email}&gt;
          </span>
        ))}
      </div>
    ) : (
      <span className="text-sm text-red-500">No contact persons found</span>
    )

  return (
    <EmailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Compose Sponsor Email"
      recipientInfo={recipientDisplay}
      contextInfo={`Sponsor: ${sponsorForConference.sponsor.name}`}
      onSend={handleSend}
      submitButtonText="Send Email"
      storageKey={`sponsor-individual-email-${sponsorForConference._id}`}
      warningContent={localhostWarning}
      previewComponent={createPreview}
      fromAddress={fromEmail}
      initialValues={{
        subject: defaultSubject,
        message: initialMessage,
      }}
      placeholder={{
        subject: 'Enter email subject...',
        message: 'Enter your message here...',
      }}
    />
  )
}
