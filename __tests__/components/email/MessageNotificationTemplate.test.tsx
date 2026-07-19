/**
 * Audience-correct body copy for the new-message email (F4). The organizer and
 * speaker variants share the CTA + "Manage notification preferences" link but
 * differ in the "Prefer email?" sentence: an organizer reply reaches the speaker
 * and fellow organizers; a speaker reply reaches the organizers.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageNotificationTemplate } from '@/components/email/MessageNotificationTemplate'

const base = {
  recipientName: 'Recipient',
  authorName: 'Jane Speaker',
  subject: 'About your talk',
  excerpt: 'Could you shorten the abstract?',
  replyUrl: 'https://cndn.no/cfp/proposal/p1#messages',
  preferencesUrl: 'https://cndn.no/cfp/profile#notification-settings',
  eventName: 'CNDN',
  eventLocation: 'Bergen, Norway',
  eventDate: '2026-09-01',
  eventUrl: 'https://cndn.no',
  socialLinks: [],
}

describe('MessageNotificationTemplate copy', () => {
  it('uses speaker-phrased copy for a speaker recipient (default)', () => {
    const html = renderToStaticMarkup(
      <MessageNotificationTemplate {...base} isOrganizer={false} />,
    )
    expect(html).toContain('reaches the organizers by email')
    expect(html).not.toContain('speaker and fellow organizers')
    // Shared elements intact for both audiences.
    expect(html).toContain('Reply in app')
    expect(html).toContain('Manage notification preferences')
  })

  it('uses organizer-phrased copy for an organizer recipient', () => {
    const html = renderToStaticMarkup(
      <MessageNotificationTemplate {...base} isOrganizer />,
    )
    expect(html).toContain('reaches the speaker and fellow organizers by email')
    // Shared elements still intact.
    expect(html).toContain('Reply in app')
    expect(html).toContain('Manage notification preferences')
  })
})
