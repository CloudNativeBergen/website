import 'server-only'
import React from 'react'
import { resolveEmailSender, retryWithBackoff } from '@/lib/email/config'
import { resolveConferenceFrom } from '@/lib/email/from'
import { TravelSupportDecisionTemplate } from '@/components/email/TravelSupportDecisionTemplate'
import { emailBrandColor } from '@/lib/branding/theme'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { formatDate } from '@/lib/time'
import type { Conference } from '@/lib/conference/types'

/**
 * Email the speaker an organizer's travel support or expense decision. The hub
 * row carries the same news in the portal. Never throws: the decision is
 * already saved.
 */
export async function sendTravelSupportDecisionEmail({
  speaker,
  decision,
  notes,
  conference,
}: {
  speaker: { name: string; email: string }
  decision: string
  notes?: string
  conference: Conference
}): Promise<boolean> {
  try {
    const { client } = await resolveEmailSender(conference.organization?._ref)
    const eventUrl = conferenceBaseUrl(conference)
    await retryWithBackoff(async () => {
      const result = await client.emails.send({
        from: resolveConferenceFrom(conference, {
          field: 'cfpEmail',
          localPart: 'cfp',
        }),
        to: [speaker.email],
        subject: `${decision}: ${conference.title}`,
        react: React.createElement(TravelSupportDecisionTemplate, {
          speakerName: speaker.name,
          decision,
          notes,
          travelSupportUrl: `${eventUrl}/cfp/expense`,
          eventName: conference.title,
          eventLocation: [conference.city, conference.country]
            .filter(Boolean)
            .join(', '),
          eventDate: conference.startDate
            ? formatDate(conference.startDate)
            : '',
          eventUrl,
          socialLinks: conference.socialLinks || [],
          brandColor: emailBrandColor(conference.theme),
        }),
      })
      if (result.error) {
        throw new Error(`Failed to send email: ${result.error.message}`)
      }
      return result
    })
    return true
  } catch (error) {
    console.error('Failed to send travel support decision email:', error)
    return false
  }
}
