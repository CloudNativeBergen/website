import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailButton } from './EmailComponents'

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
            <p style={textStyle}>
              To get started, please complete your sponsor registration using
              the link below. You&apos;ll be asked to provide:
            </p>
            <ul
              style={{
                margin: '0 0 24px 0',
                paddingLeft: '20px',
                color: '#334155',
                fontSize: '15px',
                lineHeight: '1.8',
              }}
            >
              <li>Company details (org number, address)</li>
              <li>Contact persons</li>
              <li>Billing information</li>
              <li>Company logo</li>
            </ul>
            {contractValue && (
              <p
                style={{
                  ...textStyle,
                  fontSize: '14px',
                  color: '#64748B',
                }}
              >
                Sponsorship fee: <strong>{contractValue}</strong>
              </p>
            )}
            <p style={textStyle}>
              Once you submit, we&apos;ll prepare the sponsorship agreement for
              digital signing.
            </p>

            <EmailButton href={portalUrl}>Complete Registration</EmailButton>

            <p
              style={{
                fontSize: '14px',
                lineHeight: '1.6',
                marginTop: '24px',
                color: '#64748B',
              }}
            >
              If you have any questions, simply reply to this email. We&apos;re
              happy to help!
            </p>
          </>
        ),
      }}
    />
  )
}
