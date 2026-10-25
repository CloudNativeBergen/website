/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SpeakerBriefingPanel } from '@/components/cfp/SpeakerBriefingPanel'
import type { SpeakerBriefing } from '@/lib/speaker/briefing'

const block = (text: string) => [
  {
    _type: 'block',
    _key: 'b',
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', _key: 's', text, marks: [] }],
  },
]

const briefing: SpeakerBriefing = {
  todos: [{ kind: 'confirm-talk', proposalId: 'p2', title: 'Second' }],
  talks: [
    {
      proposalId: 'p1',
      title: 'Today talk',
      date: '2026-10-27',
      trackTitle: 'Main stage',
    },
    { proposalId: 'p3', title: 'Tomorrow talk', date: '2026-10-28' },
  ],
  checkIn: block('Badge desk'),
  equipment: block('HDMI on stage'),
  onsiteContact: {
    name: 'Kari',
    phone: '+47 900 00 000',
    email: 'k@example.com',
  },
  dinner: {
    routes: [
      {
        _key: 'r',
        meetingPoint: 'Lobby',
        meetingPointMapUrl: 'javascript:alert(1)',
      },
    ],
  },
}

describe('SpeakerBriefingPanel', () => {
  it('renders todos first with proposal links, and contact links', () => {
    const html = renderToStaticMarkup(
      <SpeakerBriefingPanel briefing={briefing} />,
    )
    expect(html).toContain('id="briefing"')
    expect(html.indexOf('Still to do')).toBeLessThan(html.indexOf('Your talks'))
    expect(html).toContain('href="/cfp/proposal/p2"')
    expect(html).toContain('href="tel:+4790000000"')
    expect(html).toContain('href="mailto:k@example.com"')
    expect(html).not.toContain('<details')
  })

  it('drops a non-http meeting point map link', () => {
    const html = renderToStaticMarkup(
      <SpeakerBriefingPanel briefing={briefing} />,
    )
    expect(html).toContain('Meeting point: Lobby')
    expect(html).not.toContain('javascript:')
  })

  it('leaves out empty sections', () => {
    const html = renderToStaticMarkup(
      <SpeakerBriefingPanel briefing={{ talks: briefing.talks }} />,
    )
    expect(html).not.toContain('Still to do')
    expect(html).not.toContain('Speaker dinner')
    expect(html).not.toContain('Venue and travel')
  })

  it('pins today’s talk, check-in and contact on a conference day', () => {
    const html = renderToStaticMarkup(
      <SpeakerBriefingPanel briefing={briefing} conferenceDay="2026-10-27" />,
    )
    const details = html.indexOf('<details')
    expect(html.indexOf('Your talks today')).toBeLessThan(details)
    expect(html.indexOf('Badge desk')).toBeLessThan(details)
    expect(html.indexOf('On-site contact')).toBeLessThan(details)
    expect(html.indexOf('HDMI on stage')).toBeGreaterThan(details)
    expect(html.slice(0, details)).not.toContain('Tomorrow talk')
    expect(html.match(/Badge desk/g)).toHaveLength(1)
  })

  it('pins the dinner with its routes and a changes link', () => {
    const html = renderToStaticMarkup(
      <SpeakerBriefingPanel
        briefing={briefing}
        pinDinner
        changesEmail="cfp@example.com"
      />,
    )
    const details = html.indexOf('<details')
    expect(html.indexOf('Speaker dinner')).toBeLessThan(details)
    expect(html.indexOf('Meeting point:')).toBeLessThan(details)
    expect(html).toContain('href="mailto:cfp@example.com"')
    expect(html.slice(details)).not.toContain('Speaker dinner')
  })
})
