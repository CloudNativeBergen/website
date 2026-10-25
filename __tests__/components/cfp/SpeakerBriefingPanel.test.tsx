/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SpeakerBriefingPanel } from '@/components/cfp/SpeakerBriefingPanel'
import type { SpeakerBriefing } from '@/lib/speaker/briefing'
import { Format } from '@/lib/proposal/types'

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
  todos: [
    {
      kind: 'confirm-talk',
      label: 'Confirm your talk',
      proposalId: 'p2',
      title: 'Second',
    },
    { kind: 'claim-ticket', label: 'Claim your free speaker ticket' },
    {
      kind: 'travel-support',
      label: 'Submit your travel support request',
    },
  ],
  talks: [
    {
      proposalId: 'p1',
      title: 'Today talk',
      format: Format.presentation_25,
      isWorkshop: false,
      date: '2026-10-27',
      trackTitle: 'Main stage',
    },
    {
      proposalId: 'p3',
      title: 'Tomorrow talk',
      format: Format.workshop_120,
      isWorkshop: true,
      date: '2026-10-28',
    },
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
    expect(html.indexOf('Still to do')).toBeLessThan(
      html.indexOf('Your talks and workshops'),
    )
    expect(html).toContain('href="/cfp/proposal/p2"')
    expect(html).toContain('Confirm your talk for “Second”')
    expect(html).toContain('href="tel:+4790000000"')
    expect(html).toContain('href="mailto:k@example.com"')
    expect(html).not.toContain('<details')
  })

  it('drops a non-http meeting point map link', () => {
    const html = renderToStaticMarkup(
      <SpeakerBriefingPanel briefing={briefing} />,
    )
    expect(html).toContain('Meet at Lobby')
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
    expect(html.indexOf('Your talk today')).toBeLessThan(details)
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
    expect(html.indexOf('Meet at')).toBeLessThan(details)
    expect(html).toContain('href="mailto:cfp@example.com"')
    expect(html.slice(details)).not.toContain('Speaker dinner')
  })

  it('links travel support and workshops, and leaves claim-ticket unlinked', () => {
    const html = renderToStaticMarkup(
      <SpeakerBriefingPanel briefing={briefing} />,
    )
    expect(html).toContain('href="/cfp/expense"')
    expect(html).toContain('<li>Claim your free speaker ticket</li>')
    expect(html).not.toContain('href="/cfp/proposal/undefined"')
    expect(html).toContain('Your workshop:')
    expect(html).toContain('href="/cfp/workshop/p3"')
    expect(html).toContain('Tue 27 Oct')
    expect(html).not.toContain('oktober')
  })

  it('never prints Invalid Date and labels departures and maps', () => {
    const html = renderToStaticMarkup(
      <SpeakerBriefingPanel
        briefing={{
          dinner: {
            startsAt: 'nonsense',
            routes: [
              {
                _key: 'a',
                meetingPoint: 'Lobby',
                meetingPointMapUrl: 'https://maps.example.com/x',
                departsAt: '2026-10-26T16:30:00Z',
                departsNote: 'after the last talk',
              },
              { _key: 'b', departsAt: 'bad', departsNote: 'whenever' },
            ],
          },
        }}
      />,
    )
    expect(html).not.toContain('Invalid Date')
    expect(html).toContain(
      'Departs Mon 26 Oct, 17:30 (local time) (after the last talk)',
    )
    expect(html).toContain('<p>whenever</p>')
    expect(html).not.toContain('Departs whenever')
    expect(html).toContain('Open map')
  })

  it('collapses nothing when nothing is pinned on a conference day', () => {
    const html = renderToStaticMarkup(
      <SpeakerBriefingPanel
        briefing={{ talks: briefing.talks?.slice(1) }}
        conferenceDay="2026-10-27"
      />,
    )
    expect(html).not.toContain('<details')
    expect(html).toContain('Tomorrow talk')
  })

  it('tells an organizer what they see and links to the editor', () => {
    const html = renderToStaticMarkup(
      <SpeakerBriefingPanel briefing={{}} asOrganizer />,
    )
    expect(html).toContain('You see this as an organizer.')
    expect(html).toContain('href="/admin/speakers/info"')
    expect(
      renderToStaticMarkup(<SpeakerBriefingPanel briefing={{}} />),
    ).not.toContain('as an organizer')
  })
})
