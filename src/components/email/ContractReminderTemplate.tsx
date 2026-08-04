// PARKED FEATURE: email template for the parked sponsor contract-signing flow.
// Kept intentionally (reachable only via the email barrel + Storybook docs,
// not from any live flow); do not delete — see contract-send.ts.

import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailButton } from './EmailComponents'

export interface ContractReminderTemplateProps {
  sponsorName: string
  signerName?: string
  signingUrl: string
  reminderNumber: number
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks?: string[]
  /**
   * Tenant brand primary (THEMING L1). Resolved by the sender via
   * `emailBrandColor`; absent falls back to the house blue.
   */
  brandColor?: string
}

export function ContractReminderTemplate({
  sponsorName,
  signerName,
  signingUrl,
  reminderNumber,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks = [],
  brandColor,
}: ContractReminderTemplateProps) {
  const greeting = signerName
    ? `Dear ${signerName},`
    : `Dear ${sponsorName} team,`
  return (
    <BaseEmailTemplate
      title={`Reminder: Sponsorship Agreement — ${eventName}`}
      titleTone="brand"
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      brandColor={brandColor}
      customContent={{
        heading: `Friendly Reminder #${reminderNumber}`,
        body: (
          <>
            <p
              style={{
                fontSize: '16px',
                lineHeight: '1.6',
                marginBottom: '16px',
                marginTop: '0',
                color: '#334155',
              }}
            >
              {greeting}
            </p>
            <p
              style={{
                fontSize: '16px',
                lineHeight: '1.6',
                marginBottom: '24px',
                marginTop: '0',
                color: '#334155',
              }}
            >
              We noticed that your sponsorship agreement for {eventName} is
              still awaiting your signature. We&apos;d love to finalize the
              partnership — please take a moment to review and sign the
              document.
            </p>

            <EmailButton href={signingUrl}>
              Review &amp; Sign Agreement
            </EmailButton>

            <p
              style={{
                fontSize: '14px',
                lineHeight: '1.6',
                marginTop: '24px',
                color: '#64748B',
              }}
            >
              If you have any questions about the agreement or need assistance,
              please don&apos;t hesitate to reply to this email.
            </p>
          </>
        ),
      }}
    />
  )
}
