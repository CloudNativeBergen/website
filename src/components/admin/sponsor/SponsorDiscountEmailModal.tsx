'use client'

import { useState, useEffect } from 'react'
import { useNotification, EmailModal } from '@/components/admin'
import { formatConferenceDateLong } from '@/lib/time'
import { BroadcastTemplate } from '@/components/email/BroadcastTemplate'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { PortableTextBlock } from '@portabletext/editor'
import { PortableTextBlock as PortableTextBlockForHTML } from '@portabletext/types'
import { createLocalhostWarning } from '@/lib/localhost-warning'

interface SponsorWithTierInfo {
  id: string
  name: string
  website?: string
  logo?: string
  tier: {
    title: string
    tagline: string
    tierType: 'standard' | 'special'
  }
  ticketEntitlement: number
}

interface SponsorDiscountEmailModalProps {
  isOpen: boolean
  onClose: () => void
  sponsor: SponsorWithTierInfo
  discountCode: string
  domain: string
  fromEmail: string
  conference: {
    title: string
    city: string
    country: string
    startDate: string
    domains: string[]
    socialLinks?: string[]
  }
}

export function SponsorDiscountEmailModal({
  isOpen,
  onClose,
  sponsor,
  discountCode,
  domain,
  fromEmail,
  conference,
}: SponsorDiscountEmailModalProps) {
  const { showNotification } = useNotification()
  const [initialMessage, setInitialMessage] = useState<PortableTextBlock[]>([])
  const [ticketUrl, setTicketUrl] = useState('')
  const [additionalFields, setAdditionalFields] = useState<
    Record<string, string | number | boolean>
  >({})
  const [initialized, setInitialized] = useState(false)
  const [userHasEditedTicketUrl, setUserHasEditedTicketUrl] = useState(false)

  useEffect(() => {
    if (isOpen && !initialized) {
      const greeting = `Dear {{{SPONSOR_NAME}}} team,

We're excited to share your sponsor discount code for ${conference.title}!

As a {{{SPONSOR_TIER}}} sponsor, you're entitled to {{{TICKET_COUNT}}} complimentary ticket{{{TICKET_COUNT_PLURAL}}} for the conference.`

      const portableTextBlocks = convertStringToPortableTextBlocks(greeting)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize email template on modal open
      setInitialMessage(portableTextBlocks)

      const defaultTicketUrl = `https://${conference.domains[0]}/tickets`

      setTicketUrl(defaultTicketUrl)
      setAdditionalFields({ ticketUrl: defaultTicketUrl })

      setInitialized(true)
    } else if (!isOpen) {
      setInitialized(false)
      setUserHasEditedTicketUrl(false)
    }
  }, [isOpen, initialized, conference.title, conference.domains])

  const defaultSubject = `Your ${conference.title} Sponsor Discount Code`

  const handleAdditionalFieldsChange = (
    fields: Record<string, string | number | boolean>,
  ) => {
    if (
      fields.ticketUrl &&
      typeof fields.ticketUrl === 'string' &&
      !userHasEditedTicketUrl
    ) {
      setTicketUrl(fields.ticketUrl)
    }
    setAdditionalFields(fields)
  }

  const handleTicketUrlChange = (newUrl: string) => {
    setTicketUrl(newUrl)
    setUserHasEditedTicketUrl(true)
    setAdditionalFields((prev) => ({ ...prev, ticketUrl: newUrl }))
  }

  const processTemplates = (text: string): string => {
    return text
      .replace(/\{\{\{SPONSOR_NAME\}\}\}/g, sponsor.name)
      .replace(/\{\{\{SPONSOR_NAME\|([^}]+)\}\}\}/g, sponsor.name)
      .replace(/\{\{\{SPONSOR_TIER\}\}\}/g, sponsor.tier.title)
      .replace(/\{\{\{SPONSOR_TIER\|([^}]+)\}\}\}/g, sponsor.tier.title)
      .replace(
        /\{\{\{TICKET_COUNT\}\}\}/g,
        sponsor.ticketEntitlement.toString(),
      )
      .replace(
        /\{\{\{TICKET_COUNT\|([^}]+)\}\}\}/g,
        sponsor.ticketEntitlement.toString(),
      )
      .replace(
        /\{\{\{TICKET_COUNT_PLURAL\}\}\}/g,
        sponsor.ticketEntitlement > 1 ? 's' : '',
      )
      .replace(
        /\{\{\{TICKET_COUNT_PLURAL\|([^}]+)\}\}\}/g,
        sponsor.ticketEntitlement > 1 ? 's' : '',
      )
  }

  const processPortableTextTemplates = (
    blocks: PortableTextBlock[],
  ): PortableTextBlock[] => {
    return blocks.map((block) => {
      if (block._type === 'block' && Array.isArray(block.children)) {
        return {
          ...block,
          children: block.children.map(
            (child: {
              _type: string
              text?: string
              [key: string]: unknown
            }) => {
              if (child._type === 'span' && typeof child.text === 'string') {
                return {
                  ...child,
                  text: processTemplates(child.text),
                }
              }
              return child
            },
          ),
        }
      }
      return block
    })
  }

  const handleSend = async ({
    subject,
    message,
  }: {
    subject: string
    message: PortableTextBlock[]
  }) => {
    if (!ticketUrl.trim()) {
      showNotification({
        type: 'warning',
        title: 'Missing ticket URL',
        message: 'Please provide the ticket registration URL.',
      })
      return
    }

    const processedSubject = processTemplates(subject)
    const processedMessage = processPortableTextTemplates(message)

    const messageJSON = JSON.stringify(
      processedMessage as PortableTextBlockForHTML[],
    )

    const response = await fetch('/admin/api/sponsors/email/discount', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sponsorId: sponsor.id,
        discountCode,
        subject: processedSubject,
        message: messageJSON,
        ticketUrl: ticketUrl.trim(),
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to send email')
    }

    const result = await response.json()

    showNotification({
      type: 'success',
      title: 'Email sent successfully',
      message: `Discount code email sent to ${result.recipientCount} contact${result.recipientCount > 1 ? 's' : ''} for ${sponsor.name}`,
    })
  }

  const localhostWarning = createLocalhostWarning(domain, 'sponsors')

  const createPreview = ({
    subject,
    messageHTML,
  }: {
    subject: string
    messageHTML: string
  }) => {
    const processedSubject = processTemplates(subject)
    const processedMessageHTML = processTemplates(messageHTML)

    const discountInfo = `
      <div style="background-color: #E0F2FE; padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid #CBD5E1;">
        <h3 style="color: #1D4ED8; margin-top: 0; margin-bottom: 16px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 18px; font-weight: 600;">
          Your Discount Code
        </h3>
        <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 15px; line-height: 1.6;">
          <li style="margin-bottom: 8px;"><strong>Discount Code:</strong> <code style="background-color: #F1F5F9; padding: 4px 8px; border-radius: 4px; font-family: Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;">${discountCode}</code></li>
          <li style="margin-bottom: 8px;"><strong>Ticket Registration:</strong> <a href="${ticketUrl}" style="color: #1D4ED8; text-decoration: none; font-weight: 500;">${ticketUrl}</a></li>
          <li style="margin-bottom: 0;"><strong>Instructions:</strong> Enter the discount code during checkout to receive your sponsor tickets</li>
        </ul>
      </div>
    `

    const fullContent = processedMessageHTML + discountInfo

    return (
      <BroadcastTemplate
        subject={processedSubject}
        eventName={conference.title}
        eventLocation={`${conference.city}, ${conference.country}`}
        eventDate={formatConferenceDateLong(conference.startDate)}
        eventUrl={`https://${conference.domains[0]}`}
        socialLinks={conference.socialLinks || []}
        content={<div dangerouslySetInnerHTML={{ __html: fullContent }} />}
      />
    )
  }

  const recipientDisplay = (
    <span className="font-inter rounded-full bg-brand-sky-mist px-3 py-1 text-sm text-brand-slate-gray dark:bg-gray-700 dark:text-gray-300">
      {sponsor.name} contact persons
    </span>
  )

  return (
    <EmailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Send Discount Code Email"
      recipientInfo={recipientDisplay}
      contextInfo={`Discount code: ${discountCode} • ${sponsor.tier.title} tier`}
      onSend={handleSend}
      submitButtonText="Send Email"
      storageKey="sponsor-discount-email-shared"
      additionalFields={additionalFields}
      onAdditionalFieldsChange={handleAdditionalFieldsChange}
      ticketUrl={ticketUrl}
      onTicketUrlChange={handleTicketUrlChange}
      warningContent={
        localhostWarning && <div className="space-y-4">{localhostWarning}</div>
      }
      helpText="This email will be sent to contact persons only. Billing emails are not included in discount code distribution. Templates: {{{SPONSOR_NAME}}}, {{{SPONSOR_TIER}}}, {{{TICKET_COUNT}}}, {{{TICKET_COUNT_PLURAL}}}."
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
