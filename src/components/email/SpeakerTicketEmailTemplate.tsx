import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import {
  EmailSection,
  EmailSectionHeader,
  EmailText,
  EmailButton,
} from './EmailComponents'
import {
  brandedOr,
  brandedTintOr,
  resolveEmailBrandPalette,
} from '@/lib/branding/email'

export interface SpeakerTicketEmailTemplateProps {
  speakerName: string
  registrationUrl: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks?: string[]
  /** Per-tenant brand primary (THEMING L1); falls back to the house blue. */
  brandColor?: string
}

export function SpeakerTicketEmailTemplate({
  speakerName,
  registrationUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks = [],
  brandColor,
}: SpeakerTicketEmailTemplateProps) {
  const brand = resolveEmailBrandPalette(brandColor)
  const intro = (
    <p
      style={{
        fontSize: '16px',
        lineHeight: '1.6',
        marginBottom: '16px',
        marginTop: '0',
        color: '#334155',
      }}
    >
      Thank you for confirming your participation in {eventName}! As a speaker,
      your conference ticket is on us. You will receive a separate email shortly
      from our ticketing provider (Checkin) with your personal invitation link
      that covers 100% of the ticket price.
    </p>
  )

  const footer = (
    <>
      <EmailSection
        backgroundColor={brandedTintOr(brand, '#E0F2FE')}
        borderColor="#CBD5E1"
        borderLeftColor={brandedOr(brand, '#1D4ED8')}
      >
        <EmailSectionHeader>
          🎟️ Your Complimentary Speaker Ticket
        </EmailSectionHeader>
        <EmailText size="14px" color="#64748B">
          Please check your inbox for an email from Checkin containing your
          secret invitation link to claim your free speaker ticket.
        </EmailText>
        <div style={{ marginTop: '16px' }}>
          <EmailButton href={registrationUrl}>View Event Page</EmailButton>
        </div>
      </EmailSection>

      <p
        style={{
          fontSize: '16px',
          color: '#334155',
          lineHeight: '1.6',
          marginBottom: '24px',
          marginTop: '0',
        }}
      >
        We look forward to seeing you on stage at {eventName}!
      </p>
    </>
  )

  return (
    <BaseEmailTemplate
      title="🎟️ Your speaker ticket is ready"
      titleTone="brand"
      speakerName={speakerName}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      brandColor={brandColor}
      showMessagesLink
      footer={footer}
    >
      {intro}
    </BaseEmailTemplate>
  )
}
