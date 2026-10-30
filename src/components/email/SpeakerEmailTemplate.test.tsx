import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SpeakerEmailTemplate } from './SpeakerEmailTemplate'

describe('SpeakerEmailTemplate', () => {
  it('renders the organizer message as text, not HTML', () => {
    const html = renderToStaticMarkup(
      SpeakerEmailTemplate({
        speakers: [{ name: 'Ada', email: 'ada@example.com' }],
        proposalTitle: 'Talk',
        proposalUrl: 'https://example.com/p',
        eventName: 'Conf',
        eventLocation: 'Bergen',
        eventDate: '1 June 2026',
        eventUrl: 'https://example.com',
        subject: 'Hi',
        message: 'Meet in <room 2> for Q&A <img src=x onerror=alert(1)>',
        senderName: 'Org',
      }),
    )
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;room 2&gt; for Q&amp;A')
  })
})
