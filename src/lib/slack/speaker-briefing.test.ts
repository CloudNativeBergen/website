import { describe, expect, it } from 'vitest'
import {
  buildBriefingSlackMessage,
  portableTextToMrkdwn,
  splitMrkdwn,
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
    expect(text).toContain('<https://maps.example/b|Open map>')
    expect(text).toContain('18:00 (local time)')
    expect(text).toContain(
      '• *Walk* · Meet at Lobby · <https://maps.example/l|Open map> · sharp',
    )
    expect(text).toContain('Badge desk')
    expect(text).toContain(
      '<https://a.example.com/cfp/list#briefing|Open your speaker dashboard>',
    )
  })
})

describe('splitMrkdwn', () => {
  it('splits within the limit and never inside a link or entity', () => {
    const link = '<https://maps.example/a very long label|Open the map here>'
    const text = Array.from(
      { length: 40 },
      (_, i) => `word${i} ${link} &amp;`,
    ).join(' ')
    const chunks = splitMrkdwn(text, 200)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(200)
      expect((c.match(/</g) ?? []).length).toBe((c.match(/>/g) ?? []).length)
      expect(c).not.toMatch(/&[a-z]*$/)
    }
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(
      text.replace(/\s+/g, ' '),
    )
  })

  it('splits a long section into several blocks', () => {
    const long = 'x '.repeat(4000)
    const m = buildBriefingSlackMessage(
      { extra: [para(long)] },
      {
        title: 'Conf A',
        dashboardUrl: 'https://a.example.com/cfp/list#briefing',
      },
    )
    expect(m.blocks.length).toBeGreaterThan(3)
    for (const b of m.blocks)
      expect(b.text!.text.length).toBeLessThanOrEqual(3000)
  })

  it('leaves the on-site phone number out of the channel', () => {
    const text = buildBriefingSlackMessage(
      { onsiteContact: { name: 'Bob', phone: '+47 400', email: 'bob@x.no' } },
      { title: 'Conf A', dashboardUrl: 'https://a.example.com/cfp/list' },
    )
      .blocks.map((b) => b.text?.text)
      .join('\n')
    expect(text).toContain('Bob · bob@x.no')
    expect(text).not.toContain('+47')
  })
})
