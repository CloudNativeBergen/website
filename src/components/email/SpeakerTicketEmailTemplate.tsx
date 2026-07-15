import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import {
  EmailSection,
  EmailSectionHeader,
  EmailText,
  EmailButton,
} from './EmailComponents'

export interface SpeakerTicketEmailTemplateProps {
  speakerName: string
  discountCode: string
  registrationUrl: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks?: string[]
}

export function SpeakerTicketEmailTemplate({
  speakerName,
  discountCode,
  registrationUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks = [],
}: SpeakerTicketEmailTemplateProps) {
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
      your conference ticket is on us. Use the complimentary code below to
      register — it covers 100% of the ticket price.
    </p>
  )

  const footer = (
    <>
      <EmailSection
        backgroundColor="#E0F2FE"
        borderColor="#CBD5E1"
        borderLeftColor="#1D4ED8"
      >
        <EmailSectionHeader>
          🎟️ Your Complimentary Speaker Ticket
        </EmailSectionHeader>
        <EmailText weight="600">Discount code</EmailText>
        <div style={{ margin: '4px 0 16px 0' }}>
          <code
            style={{
              backgroundColor: '#F1F5F9',
              padding: '6px 10px',
              borderRadius: '6px',
              fontFamily:
                "Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
              fontSize: '16px',
              color: '#0F172A',
              fontWeight: 600,
              letterSpacing: '0.5px',
            }}
          >
            {discountCode}
          </code>
        </div>
        <EmailText size="14px" color="#64748B">
          Enter this code at checkout to get your speaker ticket for free. It is
          valid for a single ticket.
        </EmailText>
      </EmailSection>

      <EmailButton href={registrationUrl}>Register Your Ticket</EmailButton>

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
      titleColor="#1D4ED8"
      speakerName={speakerName}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      footer={footer}
    >
      {intro}
    </BaseEmailTemplate>
  )
}
