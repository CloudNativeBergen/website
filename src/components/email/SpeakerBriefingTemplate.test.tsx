import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { SpeakerBriefingTemplate } from './SpeakerBriefingTemplate'

const base = {
  speakerName: 'Ada Lovelace',
  eventName: 'Conf A',
  eventLocation: 'Bergen, Norway',
  eventDate: 'October 28, 2026',
  eventUrl: 'https://a.example.com',
}

const para = (text: string) => [
  {
    _type: 'block',
    _key: text,
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', _key: 's', text, marks: [] }],
  },
]

describe('SpeakerBriefingTemplate', () => {
  it('renders only the greeting and CTA for an empty briefing', async () => {
    const html = await render(
      <SpeakerBriefingTemplate {...base} briefing={{}} />,
    )
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('https://a.example.com/cfp/list')
    for (const heading of [
      'Your talk',
      'Still to do',
      'Speaker dinner',
      'Check-in',
      'Equipment',
      'On-site contact',
      'Accommodation',
      'Venue and travel',
    ]) {
      expect(html).not.toContain(heading)
    }
  })

  it('renders every section of a full briefing', async () => {
    const html = await render(
      <SpeakerBriefingTemplate
        {...base}
        briefing={{
          talks: [
            {
              proposalId: 'p1',
              title: 'Edge Kubernetes',
              date: '2026-10-28',
              startTime: '10:00',
              endTime: '10:40',
              trackTitle: 'Main stage',
            },
          ],
          todos: [{ kind: 'upload-slides', proposalId: 'p1', title: 'Edge' }],
          dinner: {
            rsvpNote: 'RSVP on your speaker ticket',
            startsAt: '2026-10-27T17:00:00Z',
            venueName: 'Bryggen',
            address: 'Bryggen 1',
            mapUrl: 'javascript:alert(1)',
            description: para('Three courses'),
            routes: [
              {
                _key: 'r1',
                label: 'Walk',
                meetingPoint: 'Hotel lobby',
                meetingPointMapUrl: 'https://maps.example.com/lobby',
                departsAt: '2026-10-27T16:30:00Z',
                departsNote: 'sharp',
                details: para('Bring a jacket'),
              },
            ],
          },
          checkIn: para('Badge desk'),
          equipment: para('HDMI'),
          onsiteContact: { name: 'Bob', phone: '+47 1' },
          accommodation: para('Hotel X'),
          extra: para('Wifi'),
          venueName: 'Grieghallen',
          venueTravelInfo: 'Light rail',
        }}
      />,
    )
    expect(html).toContain('Your talk')
    expect(html).toContain('Main stage')
    expect(html).toContain('https://a.example.com/cfp/proposal/p1')
    expect(html).toContain('RSVP on your speaker ticket')
    // 17:00Z on 27 Oct is 18:00 in Oslo (CET).
    expect(html).toContain('18:00')
    expect(html).toContain('Three courses')
    expect(html).toContain('https://maps.example.com/lobby')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('Bring a jacket')
    for (const t of ['Badge desk', 'HDMI', 'Bob', 'Hotel X', 'Wifi']) {
      expect(html).toContain(t)
    }
    expect(html).toContain('Grieghallen')
    expect(html).toContain('Light rail')
    expect(html.indexOf('RSVP on your')).toBeLessThan(html.indexOf('18:00'))
  })
})
