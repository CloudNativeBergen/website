/**
 * Audience-correct body copy for the new-message email (S9). The organizer and
 * speaker variants share the CTA + "Manage notification preferences" link but
 * differ in the TRUTHFUL reply-fallback sentence (S9a): there is no inbound/
 * Reply-To, so a reply never reaches the conversation — an organizer's lands in
 * the CFP inbox; a speaker's reaches the organizers' shared inbox. The
 * preferences line (S9b) describes the GLOBAL profile setting, not a
 * per-conversation one. A speaker's FIRST contact (S9c) gets a warmer variant.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageNotificationTemplate } from '@/components/email/MessageNotificationTemplate'

const base = {
  recipientName: 'Recipient',
  authorName: 'Jane Speaker',
  subject: 'About your talk',
  excerpt: 'Could you shorten the abstract?',
  replyUrl: 'https://cndn.no/cfp/messages/conv-1',
  preferencesUrl: 'https://cndn.no/cfp/profile#notification-settings',
  eventName: 'CNDN',
  eventLocation: 'Bergen, Norway',
  eventDate: '2026-09-01',
  eventUrl: 'https://cndn.no',
  socialLinks: [],
}

describe('MessageNotificationTemplate copy', () => {
  it('uses truthful speaker-phrased reply copy for a speaker recipient (S9a)', () => {
    const html = renderToStaticMarkup(
      <MessageNotificationTemplate {...base} isOrganizer={false} />,
    )
    expect(html).toContain('shared inbox')
    // The false "reaches the speaker and fellow organizers" claim is gone.
    expect(html).not.toContain('speaker and fellow organizers')
    // Shared elements intact for both audiences.
    expect(html).toContain('Reply in app')
    expect(html).toContain('Manage notification preferences')
  })

  it('uses truthful organizer-phrased reply copy for an organizer recipient (S9a)', () => {
    const html = renderToStaticMarkup(
      <MessageNotificationTemplate {...base} isOrganizer />,
    )
    expect(html).toContain('land in the CFP inbox, not the conversation')
    expect(html).not.toContain('reaches the speaker and fellow organizers')
    expect(html).toContain('Reply in app')
    expect(html).toContain('Manage notification preferences')
  })

  it('preferences line describes the GLOBAL profile setting, not a per-conversation one (S9b)', () => {
    const html = renderToStaticMarkup(
      <MessageNotificationTemplate {...base} isOrganizer={false} />,
    )
    expect(html).toContain('global message-email setting on your profile')
    // No per-conversation promise.
    expect(html).not.toContain('for this conversation')
  })

  it('renders a warmer first-contact heading + intro for a speaker (S9c)', () => {
    const html = renderToStaticMarkup(
      <MessageNotificationTemplate
        {...base}
        isOrganizer={false}
        firstContact
      />,
    )
    expect(html).toContain('The CNDN organizers reached out')
    expect(html).toContain('have started a conversation with you')
    // The standard "<author> sent you a new message" intro is replaced.
    expect(html).not.toContain('sent you a new message')
  })
})
