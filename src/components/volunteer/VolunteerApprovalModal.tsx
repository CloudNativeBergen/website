'use client'

import React, { useState } from 'react'
import { EmailModal } from '@/components/admin/EmailModal'
import { VolunteerWithConference } from '@/lib/volunteer/types'
import { VolunteerApprovalTemplate } from '@/components/email/VolunteerApprovalTemplate'
import { emailBrandColor } from '@/lib/branding/theme'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { formatConferenceDateLong } from '@/lib/time'
import { PortableTextBlock } from '@sanity/types'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'

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

  const handleSend = async (data: {
    subject: string
    message: PortableTextBlock[]
  }) => {
    const htmlMessage = portableTextToHTML(
      data.message as unknown as Parameters<typeof portableTextToHTML>[0],
    )
    const plainTextMessage = htmlMessage.replace(/<[^>]*>/g, '')

    await onSend({
      subject: data.subject,
      message: plainTextMessage,
      ticketUrl: ticketUrl.trim() || undefined,
      slackInviteUrl: slackInviteUrl.trim() || undefined,
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
      initialValues={{
        subject: `Welcome to the ${confTitle} Volunteer Team!`,
        message: `Dear ${volunteer.name},\n\nWe are delighted to confirm that your application to volunteer at ${confTitle} has been approved!\n\nWe will be in touch soon with more details regarding schedules and role orientations.\n\nThank you for offering your time and dedication to make the conference an unforgettable experience!`,
      }}
      extraField={{
        label: 'Links:',
        content: (
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
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
                className="flex-1 rounded border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-brand-cloud-blue focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
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
                className="flex-1 rounded border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-brand-cloud-blue focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
              />
            </div>
          </div>
        ),
      }}
      previewComponent={({ messageHTML }) => {
        const eventLocation =
          conf?.city && conf?.country
            ? `${conf.city}, ${conf.country}`
            : 'Location TBA'
        const eventDate = conf?.startDate
          ? formatConferenceDateLong(conf.startDate)
          : 'TBD'
        const eventUrl = conf ? conferenceBaseUrl(conf) : '#'
        const socialLinks = (conf?.socialLinks || []).map((l) => l.url)

        return (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-900">
            <VolunteerApprovalTemplate
              volunteerName={volunteer.name}
              eventName={confTitle}
              eventLocation={eventLocation}
              eventDate={eventDate}
              eventUrl={eventUrl}
              message={messageHTML.replace(/<[^>]*>/g, '')}
              socialLinks={socialLinks}
              brandColor={emailBrandColor(conf?.theme)}
              registrationUrl={ticketUrl.trim() || undefined}
              slackInviteUrl={slackInviteUrl.trim() || undefined}
            />
          </div>
        )
      }}
    />
  )
}
