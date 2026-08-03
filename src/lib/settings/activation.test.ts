import { describe, it, expect } from 'vitest'
import {
  buildActivationChecklist,
  hasCustomDomain,
  hasTicketingBinding,
  type ConferenceForActivation,
} from './activation'
import type { SystemCheck } from '@/lib/system-status/types'

/** A fully configured, live conference — every required row should be done. */
const FULLY_LIVE: ConferenceForActivation = {
  title: 'Cloud Native Day',
  organizer: 'Cloud Native Bergen',
  logoBright: 'https://cdn/logo-bright.svg',
  venueName: 'Grieghallen',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-03-01',
  topics: [{ _id: 't1', title: 'Kubernetes' }],
  contactEmail: 'hi@example.com',
  cfpEmail: 'cfp@example.com',
  sponsorEmail: 'sponsors@example.com',
  registrationLink: 'https://tickets.example.com',
  ticketingProvider: 'checkin',
  checkinCustomerId: 123,
  checkinEventId: 456,
  visibility: 'live',
  domains: ['example.com', 'foo.cloudnativebergen.dev'],
}

/** The two system checks the checklist reads, both satisfied. */
const CHECKS_OK: SystemCheck[] = [
  {
    id: 'email.resendKey',
    group: 'email',
    label: 'RESEND_API_KEY',
    status: 'ok',
  },
  {
    id: 'slack.botToken',
    group: 'slack',
    label: 'SLACK_BOT_TOKEN',
    status: 'ok',
  },
]

function rowById(
  checklist: ReturnType<typeof buildActivationChecklist>,
  id: string,
) {
  const row = checklist.rows.find((r) => r.id === id)
  if (!row) throw new Error(`no row ${id}`)
  return row
}

describe('buildActivationChecklist', () => {
  it('a fresh conference has only Go-live done and does not collapse', () => {
    const checklist = buildActivationChecklist({}, [])
    // Absent visibility resolves to live, so "Go live" is the one already-done
    // required row on an otherwise-empty document.
    expect(checklist.done).toBe(1)
    expect(checklist.allDone).toBe(false)
    for (const row of checklist.rows) {
      if (row.id === 'visibility') expect(row.done).toBe(true)
      else expect(row.done).toBe(false)
    }
  })

  it('a fully configured live conference is all done and collapses', () => {
    const checklist = buildActivationChecklist(FULLY_LIVE, CHECKS_OK)
    expect(checklist.done).toBe(checklist.required)
    expect(checklist.allDone).toBe(true)
    for (const row of checklist.rows) expect(row.done).toBe(true)
  })

  it('progress counts only required rows (optional rows excluded)', () => {
    const checklist = buildActivationChecklist(FULLY_LIVE, CHECKS_OK)
    const optional = checklist.rows.filter((r) => r.optional)
    expect(optional.map((r) => r.id).sort()).toEqual(['custom-domain', 'slack'])
    expect(checklist.required).toBe(checklist.rows.length - optional.length)
  })

  it('a partially configured conference reports partial progress', () => {
    const partial: ConferenceForActivation = {
      title: 'Half Set Up',
      organizer: 'Someone',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      // no CFP window, no emails, no logo, no venue, no topics, no ticketing
      visibility: 'unlisted',
    }
    const checklist = buildActivationChecklist(partial, [])
    expect(rowById(checklist, 'basics').done).toBe(true)
    expect(rowById(checklist, 'dates').done).toBe(true)
    expect(rowById(checklist, 'cfp-window').done).toBe(false)
    expect(rowById(checklist, 'emails').done).toBe(false)
    expect(rowById(checklist, 'visibility').done).toBe(false)
    expect(checklist.allDone).toBe(false)
    expect(checklist.done).toBeGreaterThan(0)
    expect(checklist.done).toBeLessThan(checklist.required)
  })

  it('the emails row needs all three addresses', () => {
    const twoOfThree = buildActivationChecklist(
      { contactEmail: 'a@b.c', cfpEmail: 'c@b.c' },
      [],
    )
    expect(rowById(twoOfThree, 'emails').done).toBe(false)
    const allThree = buildActivationChecklist(
      { contactEmail: 'a@b.c', cfpEmail: 'c@b.c', sponsorEmail: 's@b.c' },
      [],
    )
    expect(rowById(allThree, 'emails').done).toBe(true)
  })

  it('treats blank/whitespace strings as unset', () => {
    const checklist = buildActivationChecklist(
      { title: '   ', organizer: '', venueName: '\t' },
      [],
    )
    expect(rowById(checklist, 'basics').done).toBe(false)
    expect(rowById(checklist, 'venue').done).toBe(false)
  })

  it('accepts any of the four logo fields for the brand-logo row', () => {
    expect(
      rowById(
        buildActivationChecklist({ logomarkDark: 'https://x/mark.svg' }, []),
        'branding-logo',
      ).done,
    ).toBe(true)
  })

  describe('the terminal Go-live row', () => {
    it('is done only for an explicitly live (or absent) visibility', () => {
      expect(
        rowById(
          buildActivationChecklist({ visibility: 'live' }, []),
          'visibility',
        ).done,
      ).toBe(true)
      // Absent ⇒ live (legacy documents carry no field).
      expect(rowById(buildActivationChecklist({}, []), 'visibility').done).toBe(
        true,
      )
      expect(
        rowById(
          buildActivationChecklist({ visibility: 'unlisted' }, []),
          'visibility',
        ).done,
      ).toBe(false)
    })

    it('is always the last row', () => {
      const checklist = buildActivationChecklist(FULLY_LIVE, CHECKS_OK)
      expect(checklist.rows.at(-1)?.id).toBe('visibility')
    })
  })

  describe('provider-aware ticketing row', () => {
    it('checkin (default) needs both customer and event id', () => {
      expect(
        rowById(
          buildActivationChecklist({ checkinCustomerId: 1 }, []),
          'ticketing',
        ).done,
      ).toBe(false)
      const row = rowById(
        buildActivationChecklist(
          { checkinCustomerId: 1, checkinEventId: 2 },
          [],
        ),
        'ticketing',
      )
      expect(row.done).toBe(true)
      expect(row.hint).toMatch(/checkin/i)
    })

    it('tito needs both slugs and ignores checkin ids', () => {
      // Checkin ids present but provider is tito ⇒ not done.
      expect(
        rowById(
          buildActivationChecklist(
            {
              ticketingProvider: 'tito',
              checkinCustomerId: 1,
              checkinEventId: 2,
            },
            [],
          ),
          'ticketing',
        ).done,
      ).toBe(false)
      const row = rowById(
        buildActivationChecklist(
          {
            ticketingProvider: 'tito',
            titoAccountSlug: 'acme',
            titoEventSlug: '2026',
          },
          [],
        ),
        'ticketing',
      )
      expect(row.done).toBe(true)
      expect(row.hint).toMatch(/tito/i)
    })
  })

  describe('system-check reuse', () => {
    it('email-delivery follows the email.resendKey check', () => {
      expect(
        rowById(buildActivationChecklist({}, []), 'email-delivery').done,
      ).toBe(false)
      expect(
        rowById(
          buildActivationChecklist({}, [
            {
              id: 'email.resendKey',
              group: 'email',
              label: 'x',
              status: 'error',
            },
          ]),
          'email-delivery',
        ).done,
      ).toBe(false)
      expect(
        rowById(buildActivationChecklist({}, CHECKS_OK), 'email-delivery').done,
      ).toBe(true)
    })

    it('the optional Slack row follows the slack.botToken check', () => {
      expect(rowById(buildActivationChecklist({}, []), 'slack').done).toBe(
        false,
      )
      expect(
        rowById(buildActivationChecklist({}, CHECKS_OK), 'slack').done,
      ).toBe(true)
    })
  })

  it('every row deep-links to an in-page anchor or a settings sub-page', () => {
    for (const row of buildActivationChecklist(FULLY_LIVE, CHECKS_OK).rows) {
      expect(row.anchor).toMatch(
        /^(#[a-z0-9-]+|\/admin\/settings(\/[a-z0-9-]+)+)$/,
      )
      expect(row.anchor.length).toBeGreaterThan(1)
    }
  })

  it('sends the brand-logo row to the Appearance logos sub-page', () => {
    const row = rowById(
      buildActivationChecklist({}, CHECKS_OK),
      'branding-logo',
    )
    expect(row.anchor).toBe('/admin/settings/appearance/logos')
  })
})

describe('hasTicketingBinding', () => {
  it('defaults an absent provider to checkin', () => {
    expect(
      hasTicketingBinding({ checkinCustomerId: 1, checkinEventId: 2 }),
    ).toBe(true)
    expect(
      hasTicketingBinding({ titoAccountSlug: 'a', titoEventSlug: 'b' }),
    ).toBe(false)
  })
})

describe('hasCustomDomain', () => {
  it('is false with no domains', () => {
    expect(hasCustomDomain(undefined)).toBe(false)
    expect(hasCustomDomain([])).toBe(false)
  })

  it('without a platform suffix, treats >1 domain as custom', () => {
    expect(hasCustomDomain(['only.example.com'])).toBe(false)
    expect(hasCustomDomain(['a.example.com', 'b.example.com'])).toBe(true)
  })

  it('with a platform suffix, ignores that host and its subdomains', () => {
    const suffix = 'cloudnativebergen.dev'
    expect(hasCustomDomain(['foo.cloudnativebergen.dev'], suffix)).toBe(false)
    expect(hasCustomDomain(['cloudnativebergen.dev'], suffix)).toBe(false)
    expect(
      hasCustomDomain(['foo.cloudnativebergen.dev', 'myconf.com'], suffix),
    ).toBe(true)
  })
})
