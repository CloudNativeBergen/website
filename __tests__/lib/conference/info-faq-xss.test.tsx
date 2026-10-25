/**
 * @vitest-environment jsdom
 *
 * Stored-XSS regression net for the `/info` FAQ.
 *
 * `InfoContent` renders every answer line with `dangerouslySetInnerHTML`, so
 * each answer is a raw-HTML sink. Every value below comes from the conference
 * document, which any organizer of the tenant can edit — and tenants can share
 * a parent domain for session cookies, so script executing here is a route to
 * another tenant's session. These tests assert on the resulting DOM STRUCTURE
 * (no injected elements, no event-handler attributes) rather than on substrings
 * of the HTML, because correctly escaped output still CONTAINS the harmless
 * text "onerror=" and "script".
 */
import { render } from '@testing-library/react'
import { buildInfoFaqs, getScheduleDayInfo } from '@/lib/conference/info-faq'
import { InfoContent } from '@/components/info/InfoContent'
import { createMockConference } from '../../testdata/conference'
import type { Conference, ConferenceSchedule } from '@/lib/conference/types'

const IMG_PAYLOAD = '<img src=x onerror=alert(1)>'
const SCRIPT_PAYLOAD = '"><script>alert(1)</script>'
const PAYLOAD = `${IMG_PAYLOAD}${SCRIPT_PAYLOAD}`

/** Event-handler attributes that must never survive into the rendered DOM. */
const HANDLER_ATTRIBUTES = ['onerror', 'onload', 'onclick', 'onmouseover']

function renderInfo(
  overrides: Partial<Conference>,
  schedules?: ConferenceSchedule[],
) {
  const conference = createMockConference({ ...overrides, schedules })
  const faqs = buildInfoFaqs(conference, getScheduleDayInfo(schedules))
  return render(<InfoContent faqs={faqs} />)
}

/**
 * The structural assertion. An injected payload manifests as a real element or
 * a real attribute; escaped output manifests as text. Both directions are
 * checked so the test cannot pass by rendering nothing at all.
 */
function expectNoInjection(container: HTMLElement) {
  expect(container.querySelectorAll('script')).toHaveLength(0)
  expect(container.querySelectorAll('img')).toHaveLength(0)

  for (const element of container.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      expect(
        HANDLER_ATTRIBUTES,
        `element <${element.tagName.toLowerCase()}> carries ${attribute.name}`,
      ).not.toContain(attribute.name.toLowerCase())
    }
  }
}

/** Proves the payload survived as inert TEXT, i.e. it really was escaped. */
function expectPayloadRenderedAsText(container: HTMLElement, payload: string) {
  expect(container.textContent).toContain(payload)
}

function makeSchedule(
  date: string,
  overrides: Partial<{ startTime: string; endTime: string }> = {},
): ConferenceSchedule {
  return {
    _id: `sched-${date}`,
    date,
    tracks: [
      {
        trackTitle: 'Workshops',
        trackDescription: '',
        talks: [
          {
            placeholder: 'Registration',
            startTime: overrides.startTime ?? '08:00',
            endTime: overrides.endTime ?? '09:00',
          },
        ],
      },
    ],
  }
}

describe('/info FAQ escapes tenant-supplied conference fields', () => {
  // Pre-existing fields — these already reached the sink before the
  // neutral-tenant-defaults change.
  it.each([
    ['venueName', { venueName: PAYLOAD }],
    ['venueAddress', { venueAddress: PAYLOAD }],
    ['city', { city: PAYLOAD }],
    ['country', { country: PAYLOAD }],
    // Fields added by the neutral-tenant-defaults change; each is passed as an
    // ENTIRE answer.
    ['venueTravelInfo', { venueTravelInfo: PAYLOAD }],
    ['speakerDinnerInfo', { speakerDinnerInfo: PAYLOAD }],
    ['localRecommendations', { localRecommendations: PAYLOAD }],
  ])('neutralises a payload stored in %s', (_field, overrides) => {
    const { container } = renderInfo(overrides)

    expectNoInjection(container)
    expectPayloadRenderedAsText(container, PAYLOAD)
  })

  // `contactEmail` only ever lands inside a `mailto:` href, so it is asserted
  // on the attribute rather than on text — see the dedicated href test below.
  it('neutralises a payload stored in contactEmail', () => {
    const { container } = renderInfo({ contactEmail: PAYLOAD })

    expectNoInjection(container)
  })

  /**
   * BOTH time fields on BOTH days.
   *
   * The multi-day answer interpolates six separate schedule values — each day's
   * registration, start and end — and `getScheduleDayInfo` derives them from the
   * talks, so seeding one field per day leaves most of those sites carrying a
   * benign '08:00' that no assertion can distinguish from an escaped payload.
   * An earlier version of this test did exactly that, and four of the six escape
   * calls could then be deleted individually with the whole file still green.
   */
  it('neutralises a payload stored in schedule times', () => {
    const { container } = renderInfo({}, [
      makeSchedule('2026-06-15', { startTime: PAYLOAD, endTime: PAYLOAD }),
      makeSchedule('2026-06-16', { startTime: PAYLOAD, endTime: PAYLOAD }),
    ])

    expectNoInjection(container)
    expectPayloadRenderedAsText(container, PAYLOAD)
  })

  it('neutralises payloads in every field at once, single-day schedule', () => {
    const { container } = renderInfo(
      {
        venueName: PAYLOAD,
        venueAddress: PAYLOAD,
        city: PAYLOAD,
        country: PAYLOAD,
        contactEmail: PAYLOAD,
        venueTravelInfo: PAYLOAD,
        speakerDinnerInfo: PAYLOAD,
        localRecommendations: PAYLOAD,
      },
      [makeSchedule('2026-06-15', { startTime: PAYLOAD, endTime: PAYLOAD })],
    )

    expectNoInjection(container)
  })

  /**
   * The multi-day counterpart of the case above. The single-day and multi-day
   * date answers are DIFFERENT branches with different interpolations, so a
   * single-day-only sweep leaves the multi-day branch — the one with six
   * schedule interpolations — untested.
   */
  it('neutralises payloads in every field at once, multi-day schedule', () => {
    const { container } = renderInfo(
      {
        venueName: PAYLOAD,
        venueAddress: PAYLOAD,
        city: PAYLOAD,
        country: PAYLOAD,
        contactEmail: PAYLOAD,
        venueTravelInfo: PAYLOAD,
        speakerDinnerInfo: PAYLOAD,
        localRecommendations: PAYLOAD,
      },
      [
        makeSchedule('2026-06-15', { startTime: PAYLOAD, endTime: PAYLOAD }),
        makeSchedule('2026-06-16', { startTime: PAYLOAD, endTime: PAYLOAD }),
      ],
    )

    expectNoInjection(container)
    expectPayloadRenderedAsText(container, PAYLOAD)
  })

  it('keeps a payload inside the mailto href as an inert attribute value', () => {
    const { container } = renderInfo({ contactEmail: PAYLOAD })

    const mailtoLinks = Array.from(container.querySelectorAll('a')).filter(
      (anchor) => anchor.getAttribute('href')?.startsWith('mailto:'),
    )
    expect(mailtoLinks.length).toBeGreaterThan(0)

    // The `">` in the payload must not have terminated the href attribute: the
    // whole payload has to still be INSIDE the attribute value.
    for (const anchor of mailtoLinks) {
      expect(anchor.getAttribute('href')).toBe(`mailto:${PAYLOAD}`)
    }
    expectNoInjection(container)
  })

  it('renders no raw `<` from a payload outside of escaped form', () => {
    const { container } = renderInfo({ venueTravelInfo: PAYLOAD })

    // Every `<` the payload contributed must live in a text node, never as
    // markup. Serialising the DOM re-escapes text `<` back to `&lt;`, so the
    // payload must be absent from the HTML in raw form.
    expect(container.innerHTML).not.toContain(IMG_PAYLOAD)
    expect(container.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('/info FAQ preserves its own hardcoded markup', () => {
  it('still renders the code-of-conduct and speaker-dashboard links', () => {
    const { container } = renderInfo({})

    const hrefs = Array.from(container.querySelectorAll('a')).map((anchor) =>
      anchor.getAttribute('href'),
    )
    expect(hrefs).toContain('/conduct')
    expect(hrefs).toContain('/cfp/list')
  })

  it('still renders a working mailto link for a normal contact address', () => {
    const { container } = renderInfo({ contactEmail: 'hello@example.com' })

    const hrefs = Array.from(container.querySelectorAll('a')).map((anchor) =>
      anchor.getAttribute('href'),
    )
    expect(hrefs).toContain('mailto:hello@example.com')
  })

  it('renders benign tenant prose unchanged', () => {
    const { container } = renderInfo({
      venueName: 'Grand Hotel',
      city: 'Bergen',
      country: 'Norway',
      venueTravelInfo: 'Take the tram to the venue.',
    })

    expect(container.textContent).toContain(
      'The conference will take place at Grand Hotel in Bergen, Norway.',
    )
    expect(container.textContent).toContain('Take the tram to the venue.')
  })

  it('round-trips an ampersand in tenant prose without showing the entity', () => {
    const { container } = renderInfo({ venueName: 'Rick & Morty Hall' })

    expect(container.textContent).toContain('Rick & Morty Hall')
    expect(container.textContent).not.toContain('&amp;')
  })
})

const block = (text: string, href?: string) => ({
  _type: 'block',
  _key: text.slice(0, 8),
  style: 'normal',
  markDefs: href ? [{ _key: 'l', _type: 'link', href }] : [],
  children: [{ _type: 'span', _key: 's', text, marks: href ? ['l'] : [] }],
})

describe('/info speaker briefing', () => {
  it('neutralises payloads in the structured dinner and contact', () => {
    const { container } = renderInfo({
      speakerInfo: {
        dinner: {
          venueName: PAYLOAD,
          mapUrl: 'javascript:alert(1)',
          description: [block(PAYLOAD, 'javascript:alert(1)')],
          rsvpNote: PAYLOAD,
          routes: [
            {
              _key: 'r',
              label: PAYLOAD,
              meetingPoint: PAYLOAD,
              meetingPointMapUrl: 'javascript:alert(1)',
              departsNote: PAYLOAD,
            },
          ],
        },
        onsiteContact: { name: PAYLOAD, phone: PAYLOAD, email: PAYLOAD },
        checkIn: [block(PAYLOAD)],
      },
    })

    expectNoInjection(container)
    expectPayloadRenderedAsText(container, PAYLOAD)
    for (const a of container.querySelectorAll('a')) {
      expect(a.getAttribute('href')).not.toMatch(/^javascript:/i)
    }
    expect(container.textContent).not.toContain('Open map')
  })

  it('renders the structured dinner with its routes', () => {
    const { container } = renderInfo({
      speakerDinnerInfo: 'ignored when structured',
      speakerInfo: {
        dinner: {
          startsAt: '2026-10-27T17:00:00Z',
          venueName: 'Harbour Hall',
          address: 'Quay 1',
          mapUrl: 'https://maps.example/x',
          rsvpNote: 'Reply by Friday.',
          description: [block('Three courses.')],
          routes: [
            {
              _key: 'r',
              label: 'Walk',
              meetingPoint: 'Lobby',
              meetingPointMapUrl: 'https://maps.example/lobby',
              departsAt: '2026-10-27T16:30:00Z',
              departsNote: 'sharp',
              details: [block('Bring a jacket.')],
            },
            { _key: 'b', label: 'Bus', departsNote: 'after the last talk' },
          ],
        },
      },
    })

    const text = container.textContent ?? ''
    expect(text).toContain('Tue 27 Oct, 18:00 (local time)')
    expect(text).toContain('Harbour Hall')
    expect(text).toContain('Quay 1')
    expect(text).toContain('Three courses.')
    expect(text).not.toContain('Reply by Friday.')
    expect(text).toContain(
      'Walk: meet at Lobby (Open map), departs Tue 27 Oct, 17:30 (local time), sharp',
    )
    expect(text).toContain('Bus: departs after the last talk')
    expect(
      container.querySelector('a[href="https://maps.example/lobby"]'),
    ).not.toBeNull()
    expect(text).toContain('Bring a jacket.')
    expect(text).not.toContain('ignored when structured')
    expect(
      container.querySelector('a[href="https://maps.example/x"]'),
    ).not.toBeNull()
  })

  it('falls back to the plain dinner text and the default laptop answer', () => {
    const { container } = renderInfo({ speakerDinnerInfo: 'Dinner at 7.' })

    const text = container.textContent ?? ''
    expect(text).toContain('Dinner at 7.')
    expect(text).toContain('Yes, please bring your own laptop.')
    expect(text).not.toContain('Who do I contact on site?')
    expect(text).not.toContain('Where do I check in as a speaker?')
  })

  it('replaces the laptop answer with tenant equipment info', () => {
    const { container } = renderInfo({
      speakerInfo: { equipment: [block('HDMI only.')] },
    })

    expect(container.textContent).toContain('HDMI only.')
    expect(container.textContent).not.toContain('bring your own laptop')
    expect(container.textContent).toContain('What equipment is provided?')
  })

  it('flattens headings and lists and skips non-text blocks', () => {
    const { container } = renderInfo({
      speakerInfo: {
        extra: [
          { ...block('Heading'), style: 'h2' },
          { ...block('Item'), listItem: 'bullet', level: 1 },
          { _type: 'image', _key: 'img' },
        ],
      },
    })

    expect(container.querySelectorAll('dd :is(h2, ul, li)')).toHaveLength(0)
    expect(container.textContent).toContain('Heading')
    expect(container.textContent).toContain('Item')
  })

  it('keeps the on-site phone off the page, and a phone-only contact', () => {
    const withName = renderInfo({
      speakerInfo: {
        onsiteContact: { name: 'Kari', phone: '+47 123', email: 'k@x.no' },
      },
    }).container
    expect(withName.textContent).toContain('Kari')
    expect(withName.textContent).toContain('k@x.no')
    expect(withName.textContent).not.toContain('+47 123')
    expect(withName.querySelector('a[href^="tel:"]')).toBeNull()

    const phoneOnly = renderInfo({
      speakerInfo: { onsiteContact: { phone: '+47 123' } },
    }).container
    expect(phoneOnly.textContent).not.toContain('Who do I contact on site?')
  })

  it('orders the speaker questions like the dashboard and email', () => {
    const { container } = renderInfo({
      speakerDinnerInfo: 'Dinner.',
      speakerInfo: {
        checkIn: [block('Desk.')],
        equipment: [block('HDMI.')],
        onsiteContact: { name: 'Kari' },
        accommodation: [block('Hotel.')],
        extra: [block('More.')],
      },
    })

    const questions = [...container.querySelectorAll('dt')].map(
      (dt) => dt.textContent,
    )
    const order = [
      'Will there be a speaker dinner?',
      'Where do I check in as a speaker?',
      'What equipment is provided?',
      'Who do I contact on site?',
      'Where should I stay?',
      'Anything else I should know?',
    ].map((q) => questions.indexOf(q))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
})
