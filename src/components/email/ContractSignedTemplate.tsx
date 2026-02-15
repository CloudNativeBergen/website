import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailSection, EmailSectionHeader, EmailText } from './EmailComponents'

export interface ContractSignedTemplateProps {
  sponsorName: string
  signerName: string
  tierName?: string
  contractValue?: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks?: string[]
}

export function ContractSignedTemplate({
  sponsorName,
  signerName,
  tierName,
  contractValue,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks = [],
}: ContractSignedTemplateProps) {
  const detailRows = [
    { label: 'Event', value: eventName },
    eventDate && { label: 'Date', value: eventDate },
    eventLocation && { label: 'Location', value: eventLocation },
    { label: 'Organization', value: sponsorName },
    tierName && { label: 'Partnership Level', value: tierName },
    contractValue && { label: 'Total Fee', value: contractValue },
    { label: 'Signed by', value: signerName },
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <BaseEmailTemplate
      title={`Contract Confirmed — ${eventName}`}
      titleColor="#059669"
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      customContent={{
        heading: `Welcome aboard ${eventName}!`,
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
              Dear {signerName},
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
              Thank you for signing the sponsorship agreement for {eventName}!
              We are thrilled to have {sponsorName} on board as a partner.
            </p>

            <EmailSection backgroundColor="#F0FDF4" borderColor="#BBF7D0">
              <EmailSectionHeader color="#059669">
                Sponsorship Details
              </EmailSectionHeader>
              {detailRows.map((row, idx) => (
                <EmailText key={idx}>
                  <strong>{row.label}:</strong> {row.value}
                </EmailText>
              ))}
            </EmailSection>

            <p
              style={{
                fontSize: '16px',
                lineHeight: '1.6',
                marginBottom: '16px',
                marginTop: '0',
                color: '#334155',
              }}
            >
              A copy of the signed agreement is attached to this email for your
              records.
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
              <strong>Next steps:</strong> We will send you an onboarding link
              shortly where you can provide company details, logos, and contact
              information for the event.
            </p>

            <p
              style={{
                fontSize: '14px',
                lineHeight: '1.6',
                marginTop: '24px',
                color: '#64748B',
              }}
            >
              If you have any questions in the meantime, please don&apos;t
              hesitate to reply to this email.
            </p>
          </>
        ),
      }}
    />
  )
}
