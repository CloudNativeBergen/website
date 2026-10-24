import React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { brandedOr, resolveEmailBrandPalette } from '@/lib/branding/email'

interface CoSpeakerRemovedTemplateProps {
  speakerName: string
  proposalTitle: string
  /** The organizer's optional note. */
  comment?: string
  /** The conference CFP address, never an organizer's own login. */
  contactEmail: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks: string[]
  brandColor?: string
}

/**
 * An organizer took this person off a talk that keeps running with its other
 * speakers. They leave the talk's message thread with it, so this email is the
 * one place they hear about it.
 */
export const CoSpeakerRemovedTemplate: React.FC<
  CoSpeakerRemovedTemplateProps
> = ({
  speakerName,
  proposalTitle,
  comment,
  contactEmail,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks,
  brandColor,
}) => {
  const brand = resolveEmailBrandPalette(brandColor)
  const text = {
    marginBottom: '20px',
    fontSize: '15px',
    color: '#334155',
    lineHeight: '1.6',
  }
  return (
    <BaseEmailTemplate
      title={`You are no longer a speaker on "${proposalTitle}"`}
      speakerName={speakerName}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      brandColor={brandColor}
    >
      <div style={{ padding: '20px' }}>
        <h2
          style={{
            marginBottom: '20px',
            fontSize: '24px',
            fontWeight: '600',
            color: brandedOr(brand, '#1D4ED8'),
          }}
        >
          You have been removed from a talk
        </h2>
        <p style={text}>
          The organizers of {eventName} have removed you as a speaker on{' '}
          <strong>&quot;{proposalTitle}&quot;</strong>. The talk goes ahead with
          its other speakers.
        </p>
        {comment && (
          <p style={{ ...text, whiteSpace: 'pre-line' }}>
            <strong>Message from the organizers:</strong>
            <br />
            {comment}
          </p>
        )}
        <p style={{ fontSize: '14px', color: '#6b7280' }}>
          If this is wrong, reply to this email or write to the organizers at{' '}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
        </p>
      </div>
    </BaseEmailTemplate>
  )
}
