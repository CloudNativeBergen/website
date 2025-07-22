import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'

export interface SpeakerBroadcastTemplateProps {
  subject: string
  speakerName: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks?: string[]
  content: React.ReactNode // Rich text content from PortableText
}

export function SpeakerBroadcastTemplate({
  subject,
  speakerName,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks,
  content,
}: SpeakerBroadcastTemplateProps) {
  const contentStyle: React.CSSProperties = {
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#334155',
    marginBottom: '24px',
  }

  return (
    <BaseEmailTemplate
      title={subject}
      titleColor="#1D4ED8"
      speakerName={speakerName}
      proposalTitle="" // Not applicable for broadcast emails
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks || []}
    >
      <div style={contentStyle}>{content}</div>
    </BaseEmailTemplate>
  )
}
