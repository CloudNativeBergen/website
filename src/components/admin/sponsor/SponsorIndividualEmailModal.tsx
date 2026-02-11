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
import { SponsorTemplatePicker } from './SponsorTemplatePicker'

interface SponsorIndividualEmailModalProps {
  isOpen: boolean
  onClose: () => void
  onSent?: () => void
  sponsorForConference: SponsorForConferenceExpanded
  domain: string
  fromEmail: string
  senderName?: string
  conference: {
    title: string
    city: string
    country: string
    startDate: string
    organizer?: string
    domains: string[]
    socialLinks?: string[]
    prospectusUrl?: string
  }
}

export function SponsorIndividualEmailModal({
  isOpen,
  onClose,
  onSent,
  sponsorForConference,
  domain,
  fromEmail,
  senderName,
  conference,
}: SponsorIndividualEmailModalProps) {
  const { showNotification } = useNotification()
  const [initialMessage, setInitialMessage] = useState<PortableTextBlock[]>([])

  const contacts = sponsorForConference.contactPersons || []

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
    const contractStatus = sponsorForConference.contractStatus
    const invoiceStatus = sponsorForConference.invoiceStatus
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
      onSent?.()
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
        eventDate={formatConferenceDateLong(conference.startDate)}
        eventUrl={`https://${conference.domains[0]}`}
        socialLinks={conference.socialLinks || []}
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
      templateSelector={({ setSubject, setMessage }) => (
        <SponsorTemplatePicker
          sponsorName={sponsorForConference.sponsor.name}
          contactNames={
            contacts.length > 0
              ? contacts.map((c) => c.name).join(', ')
              : undefined
          }
          conference={conference}
          senderName={senderName}
          tierName={sponsorForConference.tier?.title}
          onApply={(subject, body) => {
            setSubject(subject)
            setMessage(body)
          }}
          crmContext={{
            tags: sponsorForConference.tags,
            status: sponsorForConference.status,
            currency: sponsorForConference.contractCurrency,
            orgNumber: sponsorForConference.sponsor.orgNumber,
            website: sponsorForConference.sponsor.website,
          }}
        />
      )}
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
