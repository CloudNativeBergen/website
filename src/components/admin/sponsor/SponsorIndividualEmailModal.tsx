'use client'

import { useState, useEffect } from 'react'
import { useNotification, EmailModal } from '@/components/admin'
import { useRouter } from 'next/navigation'
import { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { BroadcastTemplate } from '@/components/email/BroadcastTemplate'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { PortableTextBlock } from '@portabletext/editor'
import { PortableTextBlock as PortableTextBlockForHTML } from '@portabletext/types'
import { formatConferenceDateLong } from '@/lib/time'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { emailBrandColor, type ConferenceTheme } from '@/lib/branding/theme'
import { resolveEmailBrandPalette, brandedOr } from '@/lib/branding/email'
import { createLocalhostWarning } from '@/lib/localhost-warning'
import { SponsorTemplatePicker } from './SponsorTemplatePicker'
import { api } from '@/lib/trpc/client'

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
    theme?: ConferenceTheme | null
    registrationLink?: string
    sponsorRegistrationLink?: string
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
  const router = useRouter()
  const saveSponsorLinkMutation =
    api.conference.updateSponsorRegistrationLink.useMutation()
  const [ticketUrl, setTicketUrl] = useState('')
  const [userHasEditedTicketUrl, setUserHasEditedTicketUrl] = useState(false)
  const [savedSponsorLink, setSavedSponsorLink] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [additionalFields, setAdditionalFields] = useState<
    Record<string, string | number | boolean>
  >({})

  const [initialMessage, setInitialMessage] = useState<PortableTextBlock[]>([])

  const contacts = sponsorForConference.contactPersons || []

  useEffect(() => {
    if (isOpen && !initialized) {
      const greeting = `Dear ${sponsorForConference.sponsor.name} team,\n\n`
      const portableTextBlocks = convertStringToPortableTextBlocks(greeting)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize message template on modal open
      setInitialMessage(portableTextBlocks)

      const defaultTicketUrl =
        conference.sponsorRegistrationLink ||
        conference.registrationLink ||
        `${conferenceBaseUrl(conference)}/tickets`

      setTicketUrl(defaultTicketUrl)
      setAdditionalFields({ ticketUrl: defaultTicketUrl })
      setInitialized(true)
    } else if (!isOpen) {
      setInitialized(false)
      setUserHasEditedTicketUrl(false)
    }
  }, [isOpen, initialized, sponsorForConference.sponsor.name, conference])

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
  const sendEmailMutation = api.sponsor.crm.sendEmail.useMutation()

  const storedSponsorLink =
    savedSponsorLink ?? conference.sponsorRegistrationLink ?? ''
  const trimmedTicketUrl = ticketUrl.trim()
  const publicFallbacks = [
    conference.registrationLink,
    `${conferenceBaseUrl(conference)}/tickets`,
  ]
  const canSaveSponsorLink =
    trimmedTicketUrl !== '' &&
    trimmedTicketUrl !== storedSponsorLink &&
    !publicFallbacks.includes(trimmedTicketUrl)

  const handleSaveSponsorLink = async () => {
    try {
      await saveSponsorLinkMutation.mutateAsync({
        sponsorRegistrationLink: trimmedTicketUrl,
      })
      setSavedSponsorLink(trimmedTicketUrl)
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Saved to conference',
        message: 'This link is now the default ticket URL for sponsor emails.',
      })
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Could not save the link',
        message: `${error instanceof Error ? error.message : 'The conference was not updated'}. The email still uses the link you typed.`,
      })
    }
  }

  const sponsorLinkSaveAction = canSaveSponsorLink ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={handleSaveSponsorLink}
        disabled={saveSponsorLinkMutation.isPending}
        className="font-space-grotesk rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        {saveSponsorLinkMutation.isPending
          ? 'Saving…'
          : 'Save as conference default'}
      </button>
      <span className="font-inter text-xs text-gray-500 dark:text-gray-400">
        Stores this link on the conference.
      </span>
    </div>
  ) : null

  const missingSponsorLinkWarning = !storedSponsorLink && (
    <div className="mb-4 rounded-md bg-yellow-50 p-4 dark:bg-yellow-900/30">
      <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
        No Sponsor Registration Link
      </h3>
      <p className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
        This conference has no sponsor registration link. You can paste one
        below and save it as the default.
      </p>
    </div>
  )

  const handleTicketUrlChange = (newUrl: string) => {
    setTicketUrl(newUrl)
    setUserHasEditedTicketUrl(true)
    setAdditionalFields((prev) => ({ ...prev, ticketUrl: newUrl }))
  }
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

  const handleSend = async ({
    subject,
    message,
  }: {
    subject: string
    message: PortableTextBlock[]
  }) => {
    const messageJSON = JSON.stringify(message as PortableTextBlockForHTML[])

    const result = await sendEmailMutation.mutateAsync({
      sponsorId: sponsorForConference.sponsor._id,
      subject,
      message: messageJSON,
      ...(trimmedTicketUrl ? { ticketUrl: trimmedTicketUrl } : {}),
    })

    showNotification({
      type: 'success',
      title: 'Email sent successfully',
      message: `Sent to ${result.recipientCount} contact${result.recipientCount > 1 ? 's' : ''} for ${sponsorForConference.sponsor.name}`,
    })
    onSent?.()
  }

  const localhostWarning = createLocalhostWarning(domain, 'sponsors')

  const createPreview = ({
    subject,
    messageHTML,
  }: {
    subject: string
    messageHTML: string
  }) => {
    let finalHtmlContent = messageHTML
    if (trimmedTicketUrl) {
      const previewBrand = resolveEmailBrandPalette(
        emailBrandColor(conference.theme),
      )
      const ticketInfo = `
        <div style="background-color: ${previewBrand.cardBackground}; padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid ${previewBrand.cardBorder};">
          <h3 style="color: ${brandedOr(previewBrand, '#1D4ED8')}; margin-top: 0; margin-bottom: 16px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 18px; font-weight: 600;">
            Ticket Registration
          </h3>
          <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 15px; line-height: 1.6;">
            <li style="margin-bottom: 0;"><a href="${trimmedTicketUrl}" style="color: ${brandedOr(previewBrand, '#1D4ED8')}; text-decoration: none; font-weight: 500;">${trimmedTicketUrl}</a></li>
          </ul>
        </div>
      `
      finalHtmlContent += ticketInfo
    }

    return (
      <BroadcastTemplate
        subject={subject}
        eventName={conference.title}
        eventLocation={`${conference.city}, ${conference.country}`}
        eventDate={formatConferenceDateLong(conference.startDate)}
        eventUrl={conferenceBaseUrl(conference)}
        socialLinks={conference.socialLinks || []}
        brandColor={emailBrandColor(conference.theme)}
        content={<div dangerouslySetInnerHTML={{ __html: finalHtmlContent }} />}
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

      previewComponent={createPreview}
      brandColor={emailBrandColor(conference.theme)}
      fromAddress={fromEmail}
      ticketUrl={ticketUrl}
      onTicketUrlChange={handleTicketUrlChange}
      ticketUrlAction={sponsorLinkSaveAction}
      additionalFields={additionalFields}
      onAdditionalFieldsChange={handleAdditionalFieldsChange}
      warningContent={
        (localhostWarning || missingSponsorLinkWarning) && (
          <div className="space-y-4">
            {localhostWarning}
            {missingSponsorLinkWarning}
          </div>
        )
      }
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
