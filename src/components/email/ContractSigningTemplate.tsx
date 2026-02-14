import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import {
  EmailSection,
  EmailSectionHeader,
  EmailText,
  EmailButton,
} from './EmailComponents'

export interface ContractSigningTemplateProps {
  sponsorName: string
  signerEmail: string
  signingUrl: string
  tierName?: string
  contractValue?: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks?: string[]
}

export function ContractSigningTemplate({
  sponsorName,
  signerEmail,
  signingUrl,
  tierName,
  contractValue,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks = [],
}: ContractSigningTemplateProps) {
  const packageRows = [
    tierName && { label: 'Partnership Level', value: tierName },
    contractValue && { label: 'Total Fee', value: contractValue },
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <BaseEmailTemplate
      title={`Sponsorship Agreement — ${eventName}`}
      titleColor="#1D4ED8"
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      customContent={{
        heading: `Sponsorship Agreement — ${eventName}`,
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
              Dear {sponsorName} team,
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
              Your sponsorship agreement for {eventName} is ready for digital
              signing. Please review and sign the document at your earliest
              convenience.
            </p>

            {packageRows.length > 0 && (
              <EmailSection backgroundColor="#F8FAFC" borderColor="#E5E7EB">
                <EmailSectionHeader>Sponsorship Details</EmailSectionHeader>
                {packageRows.map((row, idx) => (
                  <EmailText key={idx}>
                    <strong>{row.label}:</strong> {row.value}
                  </EmailText>
                ))}
                <EmailText size="14px" color="#64748B">
                  Signer: {signerEmail}
                </EmailText>
              </EmailSection>
            )}

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
              This is a secure link to Adobe Sign where you can review the full
              agreement and provide your digital signature. The link is unique
              to your email address.
            </p>
          </>
        ),
      }}
    />
  )
}
