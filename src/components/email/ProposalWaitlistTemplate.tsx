import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailSection, EmailSectionHeader, EmailText } from './EmailComponents'
import { BaseEmailTemplateProps } from '@/lib/proposal'

export function ProposalWaitlistTemplate({
  speakerName,
  proposalTitle,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  comment,
  socialLinks = [],
}: BaseEmailTemplateProps) {
  const waitlistText = (
    <p
      style={{
        fontSize: '16px',
        lineHeight: '1.6',
        marginBottom: '16px',
        marginTop: '0',
        color: '#334155',
      }}
    >
      Thank you for submitting your proposal to {eventName}. After careful
      review, we&apos;re pleased to inform you that your proposal has been added
      to our waitlist.
    </p>
  )

  const footer = (
    <>
      {comment && (
        <EmailSection
          backgroundColor="#FFF7ED"
          borderColor="#FDBA74"
          borderLeftColor="#F97316"
        >
          <EmailSectionHeader>Message from the organizers:</EmailSectionHeader>
          <EmailText italic>{comment}</EmailText>
        </EmailSection>
      )}

      <EmailSection
        backgroundColor="#FEF3C7"
        borderColor="#F59E0B"
        borderLeftColor="#D97706"
      >
        <EmailSectionHeader color="#1F2937">
          ℹ️ What does this mean?
        </EmailSectionHeader>
        <EmailText color="#1F2937">
          While we couldn&apos;t include your talk in the initial program, your
          proposal is on our waitlist. If a speaking slot becomes available,
          we&apos;ll reach out to you as soon as possible.
        </EmailText>
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
        We appreciate your interest in {eventName} and hope to have the
        opportunity to include your talk in the program. We&apos;ll keep you
        updated if anything changes.
      </p>
    </>
  )

  return (
    <BaseEmailTemplate
      title="Your proposal has been waitlisted"
      titleColor="#F97316"
      speakerName={speakerName}
      proposalTitle={proposalTitle}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      footer={footer}
    >
      {waitlistText}
    </BaseEmailTemplate>
  )
}
