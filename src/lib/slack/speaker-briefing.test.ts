import { describe, expect, it } from 'vitest'
import {
  buildBriefingSlackMessage,
  portableTextToMrkdwn,
} from './speaker-briefing'

const para = (
  text: string,
  marks: string[] = [],
  markDefs: unknown[] = [],
) => ({
  _type: 'block',
  _key: text,
  style: 'normal',
  markDefs,
  children: [{ _type: 'span', _key: 's', text, marks }],
})

const textOf = (m: ReturnType<typeof buildBriefingSlackMessage>) =>
  m.blocks.map((b) => b.text?.text ?? '').join('\n')

const opts = {
  title: 'Conf A',
  dashboardUrl: 'https://a.example.com/cfp/list#briefing',
}

describe('portableTextToMrkdwn', () => {
  it('keeps bold, italics and http(s) links, drops other links', () => {
    expect(
      portableTextToMrkdwn([
        para('bold', ['strong']),
        para(
          'site',
          ['l1'],
          [{ _key: 'l1', _type: 'link', href: 'https://x.example' }],
        ),
        para(
          'bad',
          ['l2'],
          [{ _key: 'l2', _type: 'link', href: 'javascript:alert(1)' }],
        ),
      ]),
    ).toBe('*bold*\n<https://x.example|site>\nbad')
  })
})

describe('buildBriefingSlackMessage', () => {
  it('escapes user text so it cannot mention or link', () => {
    const m = buildBriefingSlackMessage(
      {
        dinner: { rsvpNote: '<!channel> & <https://evil|pay>' },
        extra: [para('<!here> hi')],
        onsiteContact: { name: '<@U123>' },
      },
      opts,
    )
    const text = textOf(m)
    expect(text).not.toMatch(/<!channel>|<!here>|<@U123>|<https:\/\/evil/)
    expect(text).toContain('&lt;!channel&gt; &amp; &lt;https://evil|pay&gt;')
    expect(text).toContain('&lt;!here&gt; hi')
  })

  it('mentions the channel only when asked', () => {
    expect(textOf(buildBriefingSlackMessage({}, opts))).not.toContain(
      '<!channel>',
    )
    expect(
      textOf(buildBriefingSlackMessage({}, { ...opts, mentionChannel: true })),
    ).toMatch(/^<!channel> /)
  })

  it('renders the dinner, routes and the dashboard link', () => {
    const text = textOf(
      buildBriefingSlackMessage(
        {
          dinner: {
            rsvpNote: 'RSVP on your ticket',
            startsAt: '2026-10-27T17:00:00Z',
            venueName: 'Bryggen',
            mapUrl: 'https://maps.example/b',
            routes: [
              {
                _key: 'r',
                label: 'Walk',
                meetingPoint: 'Lobby',
                meetingPointMapUrl: 'https://maps.example/l',
                departsNote: 'sharp',
              },
            ],
          },
          checkIn: [para('Badge desk')],
        },
        opts,
      ),
    )
    expect(text).toContain('RSVP on your ticket')
    expect(text).toContain('18:00 (local time)')
    expect(text).toContain('<https://maps.example/b|map>')
    expect(text).toContain(
      '• *Walk* · meet at <https://maps.example/l|Lobby> · departs sharp',
    )
    expect(text).toContain('Badge desk')
    expect(text).toContain('<https://a.example.com/cfp/list#briefing|open it>')
  })
})
