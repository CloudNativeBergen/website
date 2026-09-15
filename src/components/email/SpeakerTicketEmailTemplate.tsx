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
  /**
   * The conference's configured Checkin speaker-invite link. OMITTED when the
   * organizer has not pasted one — the template then renders NO button and no
   * link at all, and tells the speaker to use the provider's own invitation
   * instead. Never substitute a computed store URL: a deep link without an
   * invitation code grants nothing against an invitation-gated ticket.
   */
  registrationUrl?: string
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
      Thank you for confirming your participation in {eventName}. As a speaker,
      your conference ticket is free. You will also receive a separate email
      from our ticketing provider, Checkin, with a personal invitation to the
      speaker ticket.
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
        {registrationUrl ? (
          <>
            <EmailText size="14px" color="#64748B">
              Use the link below to claim your speaker ticket. It is the same
              link for every speaker, so please keep it to yourself.
            </EmailText>
            <div style={{ marginTop: '16px' }}>
              <EmailButton href={registrationUrl}>
                Claim Your Speaker Ticket
              </EmailButton>
            </div>
          </>
        ) : (
          <EmailText size="14px" color="#64748B">
            Your invitation has been sent to this address from Checkin, our
            ticket provider. Look for an email from them with your personal
            invitation link, and use that link to claim the ticket. Check your
            spam folder if it has not arrived.
          </EmailText>
        )}
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
        We look forward to seeing you on stage at {eventName}.
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
