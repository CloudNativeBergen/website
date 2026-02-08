import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'

export interface BroadcastTemplateProps {
  subject: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks?: string[]
  unsubscribeUrl?: string
  content: React.ReactNode
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
        body: (
          <div
            style={{
              fontSize: '16px',
              lineHeight: '1.6',
              marginBottom: '24px',
              color: '#334155',
            }}
          >
            {content}
          </div>
        ),
      }}
    />
  )
}
