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

  it('neutralises a payload stored in schedule times', () => {
    const { container } = renderInfo({}, [
      makeSchedule('2026-06-15', { startTime: PAYLOAD }),
      makeSchedule('2026-06-16', { endTime: PAYLOAD }),
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
