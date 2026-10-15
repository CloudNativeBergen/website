'use client'

import React, { useState } from 'react'
import { EmailModal } from '@/components/admin/EmailModal'
import { VolunteerWithConference } from '@/lib/volunteer/types'
import { VolunteerApprovalTemplate } from '@/components/email/VolunteerApprovalTemplate'
import { emailBrandColor } from '@/lib/branding/theme'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { isAbsoluteHttpsUrl } from '@/lib/conference/validation'
import { formatConferenceDateLong } from '@/lib/time'
import { PortableTextBlock } from '@sanity/types'

export interface VolunteerApprovalModalProps {
  isOpen: boolean
  onClose: () => void
  volunteer: VolunteerWithConference
  onSend: (data: {
    subject: string
    message: string
    ticketUrl?: string
    slackInviteUrl?: string
  }) => Promise<void>
  onSaveLinks?: (links: {
    ticketUrl: string
    slackInviteUrl: string
  }) => Promise<void>
  isSavingLinks?: boolean
}

const LINKS_STORAGE_PREFIX = 'volunteer-links-'

interface StoredVolunteerLinks {
  ticketUrl?: string
  slackInviteUrl?: string
  baseTicketUrl?: string
  baseSlackInviteUrl?: string
}

function readStoredVolunteerLinks(conferenceId?: string): StoredVolunteerLinks {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(
      `${LINKS_STORAGE_PREFIX}${conferenceId || 'default'}`,
    )
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      ticketUrl:
        typeof parsed.ticketUrl === 'string' ? parsed.ticketUrl : undefined,
      slackInviteUrl:
        typeof parsed.slackInviteUrl === 'string'
          ? parsed.slackInviteUrl
          : undefined,
      baseTicketUrl:
        typeof parsed.baseTicketUrl === 'string'
          ? parsed.baseTicketUrl
          : undefined,
      baseSlackInviteUrl:
        typeof parsed.baseSlackInviteUrl === 'string'
          ? parsed.baseSlackInviteUrl
          : undefined,
    }
  } catch {
    return {}
  }
}

function writeStoredVolunteerLinks(
  conferenceId: string | undefined,
  links: {
    ticketUrl: string
    slackInviteUrl: string
    baseTicketUrl: string
    baseSlackInviteUrl: string
  },
) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      `${LINKS_STORAGE_PREFIX}${conferenceId || 'default'}`,
      JSON.stringify(links),
    )
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function VolunteerApprovalModal({
  isOpen,
  onClose,
  volunteer,
  onSend,
  onSaveLinks,
  isSavingLinks = false,
}: VolunteerApprovalModalProps) {
  const conf = volunteer.conference
  const storedLinks = readStoredVolunteerLinks(conf?._id)
  const serverTicketUrl = conf?.volunteerRegistrationLink || ''
  const serverSlackUrl = conf?.volunteerSlackInviteUrl || ''
  const defaultTicketUrl =
    storedLinks.ticketUrl !== undefined &&
    (storedLinks.baseTicketUrl ?? '') === serverTicketUrl
      ? storedLinks.ticketUrl
      : serverTicketUrl
  const defaultSlackUrl =
    storedLinks.slackInviteUrl !== undefined &&
    (storedLinks.baseSlackInviteUrl ?? '') === serverSlackUrl
      ? storedLinks.slackInviteUrl
      : serverSlackUrl

  const [ticketUrl, setTicketUrl] = useState(defaultTicketUrl)
  const [slackInviteUrl, setSlackInviteUrl] = useState(defaultSlackUrl)
  const [savedServerLinks, setSavedServerLinks] = useState({
    ticketUrl: serverTicketUrl,
    slackInviteUrl: serverSlackUrl,
  })

  const updateTicketUrl = (value: string) => {
    setTicketUrl(value)
    writeStoredVolunteerLinks(conf?._id, {
      ticketUrl: value,
      slackInviteUrl,
      baseTicketUrl: savedServerLinks.ticketUrl,
      baseSlackInviteUrl: savedServerLinks.slackInviteUrl,
    })
  }

  const updateSlackInviteUrl = (value: string) => {
    setSlackInviteUrl(value)
    writeStoredVolunteerLinks(conf?._id, {
      ticketUrl,
      slackInviteUrl: value,
      baseTicketUrl: savedServerLinks.ticketUrl,
      baseSlackInviteUrl: savedServerLinks.slackInviteUrl,
    })
  }

  const trimmedTicket = ticketUrl.trim()
  const trimmedSlack = slackInviteUrl.trim()
  const ticketError =
    trimmedTicket && !isAbsoluteHttpsUrl(trimmedTicket)
      ? 'Must be an absolute https:// URL'
      : null
  const slackError =
    trimmedSlack && !isAbsoluteHttpsUrl(trimmedSlack)
      ? 'Must be an absolute https:// URL'
      : null

  const linksChangedFromServer =
    trimmedTicket !== savedServerLinks.ticketUrl.trim() ||
    trimmedSlack !== savedServerLinks.slackInviteUrl.trim()

  const handleSaveLinksToServer = async () => {
    if (!onSaveLinks || ticketError || slackError) return
    await onSaveLinks({
      ticketUrl: trimmedTicket,
      slackInviteUrl: trimmedSlack,
    })
    setSavedServerLinks({
      ticketUrl: trimmedTicket,
      slackInviteUrl: trimmedSlack,
    })
    writeStoredVolunteerLinks(conf?._id, {
      ticketUrl: trimmedTicket,
      slackInviteUrl: trimmedSlack,
      baseTicketUrl: trimmedTicket,
      baseSlackInviteUrl: trimmedSlack,
    })
  }

  const extractPlainText = (blocks: PortableTextBlock[]): string => {
    if (!Array.isArray(blocks)) return ''
    return blocks
      .map((block) => {
        if (block._type === 'block' && Array.isArray(block.children)) {
          return block.children
            .map((child: { _type?: string; text?: string }) =>
              child._type === 'span' ? child.text || '' : '',
            )
            .join('')
        }
        return ''
      })
      .filter(Boolean)
      .join('\n\n')
  }

  const handleSend = async (data: {
    subject: string
    message: PortableTextBlock[]
  }) => {
    if (ticketError || slackError) {
      throw new Error(
        ticketError || slackError || 'Please fix URL errors before sending.',
      )
    }

    const nextBaseTicket = trimmedTicket || savedServerLinks.ticketUrl
    const nextBaseSlack = trimmedSlack || savedServerLinks.slackInviteUrl
    writeStoredVolunteerLinks(conf?._id, {
      ticketUrl: trimmedTicket,
      slackInviteUrl: trimmedSlack,
      baseTicketUrl: nextBaseTicket,
      baseSlackInviteUrl: nextBaseSlack,
    })

    const plainTextMessage = extractPlainText(data.message)

    // Pass empty string "" when cleared so SendVolunteerEmailSchema transforms
    // "" -> null and suppresses the conference fallback CTA button.
    await onSend({
      subject: data.subject,
      message: plainTextMessage,
      ticketUrl: trimmedTicket,
      slackInviteUrl: trimmedSlack,
    })
  }

  const fromAddress = conf?.contactEmail || conf?.cfpEmail || ''
  const confTitle = conf?.title || 'Conference'

  return (
    <EmailModal
      isOpen={isOpen}
      onClose={onClose}
      onSend={handleSend}
      title="Send Volunteer Approval Email"
      recipientInfo={volunteer.email}
      contextInfo={`Volunteer: ${volunteer.name}`}
      fromAddress={fromAddress}
      brandColor={emailBrandColor(conf?.theme)}
      storageKey={`volunteer-approval-${conf?._id || 'conf'}-${volunteer._id}`}
      submitButtonText="Send Approval Email"
      warningContent={
        !fromAddress ? (
          <div className="rounded-md bg-yellow-50 p-2 text-xs text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">
            ⚠️ Conference contact email is not configured. Outbound approval
            emails may fail.
          </div>
        ) : undefined
      }
      additionalFields={{
        ticketUrl,
        slackInviteUrl,
      }}
      onAdditionalFieldsChange={(fields) => {
        const nextTicket =
          typeof fields.ticketUrl === 'string' ? fields.ticketUrl : ticketUrl
        const nextSlack =
          typeof fields.slackInviteUrl === 'string'
            ? fields.slackInviteUrl
            : slackInviteUrl
        setTicketUrl(nextTicket)
        setSlackInviteUrl(nextSlack)
        writeStoredVolunteerLinks(conf?._id, {
          ticketUrl: nextTicket,
          slackInviteUrl: nextSlack,
          baseTicketUrl: savedServerLinks.ticketUrl,
          baseSlackInviteUrl: savedServerLinks.slackInviteUrl,
        })
      }}
      initialValues={{
        subject: `Welcome to the ${confTitle} Volunteer Team!`,
        message: `Dear ${volunteer.name},\n\nWe are delighted to confirm that your application to volunteer at ${confTitle} has been approved!\n\nWe will be in touch soon with more details regarding schedules and role orientations.\n\nThank you for offering your time and dedication to make the conference an unforgettable experience!`,
      }}
      extraField={{
        label: 'Links:',
        content: (
          <div className="space-y-2">
            <div>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <label
                  htmlFor="volunteer-ticket-link"
                  className="w-24 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400"
                >
                  Ticket Link:
                </label>
                <input
                  id="volunteer-ticket-link"
                  type="url"
                  value={ticketUrl}
                  onChange={(e) => updateTicketUrl(e.target.value)}
                  placeholder={
                    defaultTicketUrl ||
                    'Configure in Conference Settings or paste here'
                  }
                  className={`flex-1 rounded border bg-white px-2.5 py-1 text-xs text-gray-900 placeholder-gray-400 focus:outline-none dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 ${
                    ticketError
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 focus:border-brand-cloud-blue dark:border-gray-700'
                  }`}
                />
              </div>
              {ticketError && (
                <p className="mt-0.5 pl-0 text-xs text-red-600 sm:pl-25 dark:text-red-400">
                  {ticketError}
                </p>
              )}
            </div>

            <div>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <label
                  htmlFor="volunteer-slack-link"
                  className="w-24 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400"
                >
                  Slack Invite:
                </label>
                <input
                  id="volunteer-slack-link"
                  type="url"
                  value={slackInviteUrl}
                  onChange={(e) => updateSlackInviteUrl(e.target.value)}
                  placeholder={
                    defaultSlackUrl ||
                    'Configure in Conference Settings or paste here'
                  }
                  className={`flex-1 rounded border bg-white px-2.5 py-1 text-xs text-gray-900 placeholder-gray-400 focus:outline-none dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 ${
                    slackError
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 focus:border-brand-cloud-blue dark:border-gray-700'
                  }`}
                />
              </div>
              {slackError && (
                <p className="mt-0.5 pl-0 text-xs text-red-600 sm:pl-25 dark:text-red-400">
                  {slackError}
                </p>
              )}
            </div>

            {onSaveLinks && linksChangedFromServer && (
              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  disabled={Boolean(ticketError || slackError) || isSavingLinks}
                  onClick={handleSaveLinksToServer}
                  className="text-xs font-medium text-brand-cloud-blue hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400"
                >
                  {isSavingLinks
                    ? 'Saving to conference…'
                    : 'Save links to conference'}
                </button>
              </div>
            )}
          </div>
        ),
      }}
      previewComponent={({ message }) => {
        const eventLocation =
          conf?.city && conf?.country
            ? `${conf.city}, ${conf.country}`
            : 'Location TBA'
        const eventDate = conf?.startDate
          ? formatConferenceDateLong(conf.startDate)
          : 'TBD'
        const eventUrl = conf ? conferenceBaseUrl(conf) : '#'
        const socialLinks = (conf?.socialLinks || [])
          .map((l) =>
            typeof l === 'string' ? l : (l as { url?: string })?.url,
          )
          .filter((l): l is string => typeof l === 'string' && Boolean(l))

        return (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-900">
            <VolunteerApprovalTemplate
              volunteerName={volunteer.name}
              eventName={confTitle}
              eventLocation={eventLocation}
              eventDate={eventDate}
              eventUrl={eventUrl}
              message={extractPlainText(message)}
              socialLinks={socialLinks}
              brandColor={emailBrandColor(conf?.theme)}
              confirmUrl={`${eventUrl.replace(/\/$/, '')}/volunteer/confirm?token=preview`}
              registrationUrl={
                !ticketError && trimmedTicket ? trimmedTicket : undefined
              }
              slackInviteUrl={
                !slackError && trimmedSlack ? trimmedSlack : undefined
              }
            />
          </div>
        )
      }}
    />
  )
}
