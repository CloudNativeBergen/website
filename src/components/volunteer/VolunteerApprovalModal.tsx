'use client'

import React, { useState } from 'react'
import { EmailModal } from '@/components/admin/EmailModal'
import { VolunteerWithConference } from '@/lib/volunteer/types'
import { VolunteerApprovalTemplate } from '@/components/email/VolunteerApprovalTemplate'
import { emailBrandColor } from '@/lib/branding/theme'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
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
}

export function VolunteerApprovalModal({
  isOpen,
  onClose,
  volunteer,
  onSend,
}: VolunteerApprovalModalProps) {
  const conf = volunteer.conference
  const defaultTicketUrl = conf?.volunteerRegistrationLink || ''
  const defaultSlackUrl = conf?.volunteerSlackInviteUrl || ''

  const [ticketUrl, setTicketUrl] = useState(defaultTicketUrl)
  const [slackInviteUrl, setSlackInviteUrl] = useState(defaultSlackUrl)

  const isHttpsUrl = (val: string) => {
    try {
      const url = new URL(val)
      return url.protocol === 'https:'
    } catch {
      return false
    }
  }

  const trimmedTicket = ticketUrl.trim()
  const trimmedSlack = slackInviteUrl.trim()
  const ticketError =
    trimmedTicket && !isHttpsUrl(trimmedTicket)
      ? 'Must be an absolute https:// URL'
      : null
  const slackError =
    trimmedSlack && !isHttpsUrl(trimmedSlack)
      ? 'Must be an absolute https:// URL'
      : null

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

    const plainTextMessage = extractPlainText(data.message)

    await onSend({
      subject: data.subject,
      message: plainTextMessage,
      ticketUrl: trimmedTicket || undefined,
      slackInviteUrl: trimmedSlack || undefined,
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
        if (typeof fields.ticketUrl === 'string') {
          setTicketUrl(fields.ticketUrl)
        }
        if (typeof fields.slackInviteUrl === 'string') {
          setSlackInviteUrl(fields.slackInviteUrl)
        }
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
                  onChange={(e) => setTicketUrl(e.target.value)}
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
                  onChange={(e) => setSlackInviteUrl(e.target.value)}
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
