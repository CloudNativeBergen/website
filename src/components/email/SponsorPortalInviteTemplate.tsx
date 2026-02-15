import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import {
  EmailSection,
  EmailSectionHeader,
  EmailText,
  EmailButton,
} from './EmailComponents'

export interface SponsorPortalInviteTemplateProps {
  sponsorName: string
  portalUrl: string
  tierName?: string
  contractValue?: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks?: string[]
}

export function SponsorPortalInviteTemplate({
  sponsorName,
  portalUrl,
  tierName,
  contractValue,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks = [],
}: SponsorPortalInviteTemplateProps) {
  const textStyle: React.CSSProperties = {
    fontSize: '16px',
    lineHeight: '1.6',
    marginBottom: '16px',
    marginTop: '0',
    color: '#334155',
  }

  const partnershipDetails = [
    { label: 'Event', value: eventName },
    eventDate && { label: 'Date', value: eventDate },
    eventLocation && { label: 'Location', value: eventLocation },
    tierName && { label: 'Partnership Level', value: tierName },
    contractValue && { label: 'Sponsorship Fee', value: contractValue },
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <BaseEmailTemplate
      title={`Sponsor Registration — ${eventName}`}
      titleColor="#1D4ED8"
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      customContent={{
        heading: `Welcome aboard, ${sponsorName}!`,
        body: (
          <>
            <p style={textStyle}>
              Thank you for partnering with {eventName}
              {tierName ? ` as a ${tierName} sponsor` : ''}! We&apos;re thrilled
              to have you on board.
            </p>

            <EmailSection backgroundColor="#F8FAFC" borderColor="#E5E7EB">
              <EmailSectionHeader>Partnership Details</EmailSectionHeader>
              {partnershipDetails.map((row, idx) => (
                <EmailText key={idx}>
                  <strong>{row.label}:</strong> {row.value}
                </EmailText>
              ))}
            </EmailSection>

            <p style={textStyle}>
              To get started, please complete your sponsor registration using
              the link below. This is where you&apos;ll provide company details,
              contact persons, billing information, and your company logo.
            </p>

            <EmailButton href={portalUrl}>Complete Registration</EmailButton>

            <p style={textStyle}>
              Once submitted, we&apos;ll prepare the sponsorship agreement for
              digital signing.
            </p>

            <p
              style={{
                fontSize: '14px',
                lineHeight: '1.6',
                marginTop: '24px',
                color: '#64748B',
              }}
            >
              If you have any questions or need assistance, simply reply to this
              email.
            </p>
          </>
        ),
      }}
    />
  )
}
