import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'

export interface BroadcastTemplateProps {
  subject: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks?: string[]
  unsubscribeUrl?: string // Optional unsubscribe URL for Resend broadcasts
  content: React.ReactNode // Rich text content from PortableText
}

export function BroadcastTemplate({
  subject,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks,
  unsubscribeUrl,
  content,
}: BroadcastTemplateProps) {
  const contentStyle: React.CSSProperties = {
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#334155',
    marginBottom: '24px',
  }

  return (
    <BaseEmailTemplate
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks || []}
      unsubscribeUrl={unsubscribeUrl}
      customContent={{
        heading: subject,
        body: <div style={contentStyle}>{content}</div>,
      }}
    />
  )
}
