import { describe, it, expect } from 'vitest'
import {
  buildSubprocessorDisclosure,
  discloses,
  internationalTransferProcessors,
  registrationLinkVendor,
  ticketingSignal,
  type SubprocessorId,
  type TenantProcessingFacts,
} from './subprocessors'

/** A fully-resolved, ordinary tenant: Checkin, no analytics, no Slack, no workshops. */
function facts(
  overrides: Partial<TenantProcessingFacts> = {},
): TenantProcessingFacts {
  return {
    tenantKnown: true,
    organizationReadFailed: false,
    ticketing: {
      provider: 'checkin',
      bound: true,
      explicitlySelected: false,
      registrationLink: null,
    },
    analyticsCode: null,
    slackToken: false,
    workshops: false,
    dedicatedEmailAccount: false,
    ...overrides,
  }
}

function ids(f: TenantProcessingFacts): SubprocessorId[] {
  return buildSubprocessorDisclosure(f).processors.map((p) => p.id)
}

describe('the ticketing vendor a tenant actually uses', () => {
  it('lists Checkin and NOT Tito for a Checkin-bound conference', () => {
    const list = ids(facts())
    expect(list).toContain('checkin')
    expect(list).not.toContain('tito')
  })

  it('lists Tito and NOT Checkin for a Tito-bound conference', () => {
    // The headline defect in #690: a tenant on Tito was telling its attendees
    // that Checkin.no processes their data.
    const list = ids(
      facts({
        ticketing: {
          provider: 'tito',
          bound: true,
          explicitlySelected: true,
          registrationLink: null,
        },
      }),
    )
    expect(list).toContain('tito')
    expect(list).not.toContain('checkin')
  })

  it('lists NEITHER vendor for a conference with no ticketing binding', () => {
    // A successful read that says "nothing is bound" is a fact, not an
    // ambiguity: no attendee data reaches any ticketing vendor through us.
    const list = ids(
      facts({
        ticketing: {
          provider: 'checkin',
          bound: false,
          explicitlySelected: false,
          registrationLink: null,
        },
      }),
    )
    expect(list).not.toContain('checkin')
    expect(list).not.toContain('tito')
  })

  it('still discloses a vendor that is SELECTED but not fully bound', () => {
    const disclosure = buildSubprocessorDisclosure(
      facts({
        ticketing: {
          provider: 'tito',
          bound: false,
          explicitlySelected: true,
          registrationLink: null,
        },
      }),
    )
    const tito = disclosure.processors.find((p) => p.id === 'tito')
    expect(tito?.certainty).toBe('possible')
    expect(disclosure.incomplete).toBe(true)
  })

  it('discloses the vendor an external registration link points at', () => {
    // A proxy, not a fact — so it earns `possible`, never `confirmed`.
    const disclosure = buildSubprocessorDisclosure(
      facts({
        ticketing: {
          provider: 'checkin',
          bound: false,
          explicitlySelected: false,
          registrationLink: 'https://ti.to/acme/conf-2026',
        },
      }),
    )
    expect(disclosure.processors.find((p) => p.id === 'tito')?.certainty).toBe(
      'possible',
    )
  })
})

describe('registrationLinkVendor', () => {
  it('recognises vendor hosts and subdomains', () => {
    expect(registrationLinkVendor('https://event.checkin.no/1/x')).toBe(
      'checkin',
    )
    expect(registrationLinkVendor('https://ti.to/acme/x')).toBe('tito')
    expect(registrationLinkVendor('https://tito.io/acme/x')).toBe('tito')
  })

  it('answers null for anything else, including junk', () => {
    expect(registrationLinkVendor('https://eventbrite.com/e/1')).toBeNull()
    expect(registrationLinkVendor('not a url')).toBeNull()
    expect(registrationLinkVendor('')).toBeNull()
    expect(registrationLinkVendor(null)).toBeNull()
    // A host that merely CONTAINS a vendor name must not match.
    expect(registrationLinkVendor('https://notcheckin.no/x')).toBeNull()
    expect(registrationLinkVendor('https://checkin.no.evil.test/x')).toBeNull()
  })
})

describe('ticketingSignal', () => {
  it('is unknown for BOTH vendors when nothing is known about the tenant', () => {
    expect(ticketingSignal('checkin', null)).toBe('unknown')
    expect(ticketingSignal('tito', null)).toBe('unknown')
  })
})

describe('analytics is disclosed only when a code is configured', () => {
  it('lists Pirsch when the tenant has a code', () => {
    expect(ids(facts({ analyticsCode: 'abc123XYZ' }))).toContain('pirsch')
  })

  it('omits Pirsch when there is none — no code, no script, no processor', () => {
    expect(ids(facts({ analyticsCode: '   ' }))).not.toContain('pirsch')
  })

  it('discloses a MALFORMED code rather than validating the row away', () => {
    // Deliberate over-disclosure: validating here would drop the row on a typo,
    // which is the under-report direction.
    expect(ids(facts({ analyticsCode: 'not a valid code!' }))).toContain(
      'pirsch',
    )
  })
})

describe('Slack and WorkOS follow the tenant, not the platform', () => {
  it('lists both when the tenant has a Slack token and workshops enabled', () => {
    const list = ids(facts({ slackToken: true, workshops: true }))
    expect(list).toContain('slack')
    expect(list).toContain('workos')
  })

  it('lists neither for a tenant with no token and no workshop entitlement', () => {
    const list = ids(facts())
    expect(list).not.toContain('slack')
    expect(list).not.toContain('workos')
  })
})

describe('email: which Resend account the organizer sends through', () => {
  it('says the shared platform account by default', () => {
    const resend = buildSubprocessorDisclosure(facts()).processors.find(
      (p) => p.id === 'resend',
    )
    expect(resend?.detail).toMatch(/shared platform sending account/i)
  })

  it('says the organizer’s OWN account when it has its own credentials', () => {
    const resend = buildSubprocessorDisclosure(
      facts({ dedicatedEmailAccount: true }),
    ).processors.find((p) => p.id === 'resend')
    expect(resend?.detail).toMatch(/own Resend account/i)
  })

  it('says nothing about the account when it could not be determined', () => {
    const resend = buildSubprocessorDisclosure(
      facts({ dedicatedEmailAccount: null }),
    ).processors.find((p) => p.id === 'resend')
    expect(resend?.detail).toBeUndefined()
    // Resend itself is still disclosed — it is used either way.
    expect(discloses(buildSubprocessorDisclosure(facts()), 'resend')).toBe(true)
  })
})

describe('a failed read must NOT shorten the list', () => {
  it('discloses Slack and WorkOS as POSSIBLE when the organization read failed', () => {
    // The gates themselves answer `false` here (fail closed). Inheriting that
    // would publish a shorter subprocessor list during an outage.
    const disclosure = buildSubprocessorDisclosure(
      facts({
        organizationReadFailed: true,
        slackToken: null,
        workshops: null,
      }),
    )
    expect(disclosure.processors.find((p) => p.id === 'slack')?.certainty).toBe(
      'possible',
    )
    expect(
      disclosure.processors.find((p) => p.id === 'workos')?.certainty,
    ).toBe('possible')
    expect(disclosure.incomplete).toBe(true)
  })

  it('discloses org-gated processors even when the gates report a hard false', () => {
    // The gates cannot distinguish "denied" from "read failed", so the flag —
    // not the boolean — is what decides. A `false` alongside the flag must not
    // win.
    const list = ids(
      facts({
        organizationReadFailed: true,
        slackToken: false,
        workshops: false,
      }),
    )
    expect(list).toContain('slack')
    expect(list).toContain('workos')
  })

  it('discloses EVERY conditional processor when nothing about the tenant is known', () => {
    const disclosure = buildSubprocessorDisclosure(
      facts({
        tenantKnown: false,
        ticketing: null,
        analyticsCode: null,
        slackToken: null,
        workshops: null,
        dedicatedEmailAccount: null,
      }),
    )
    for (const id of [
      'sanity',
      'vercel',
      'resend',
      'checkin',
      'tito',
      'pirsch',
      'slack',
      'oauth-providers',
      'workos',
    ] as const) {
      expect(discloses(disclosure, id)).toBe(true)
    }
    expect(disclosure.incomplete).toBe(true)
  })

  it('is NOT incomplete when every signal resolved — the other direction', () => {
    // Without this, the tests above would pass on a build that marked
    // everything `possible` all the time and proved nothing.
    expect(buildSubprocessorDisclosure(facts()).incomplete).toBe(false)
  })
})

describe('shared platform infrastructure is disclosed for everyone', () => {
  it('always lists Sanity, Vercel, Resend and the CFP sign-in providers', () => {
    const list = ids(facts())
    expect(list).toEqual(
      expect.arrayContaining(['sanity', 'vercel', 'resend', 'oauth-providers']),
    )
  })

  it('labels who chose each processor', () => {
    const disclosure = buildSubprocessorDisclosure(facts())
    const by = (id: SubprocessorId) =>
      disclosure.processors.find((p) => p.id === id)?.chosenBy
    expect(by('sanity')).toBe('platform')
    expect(by('checkin')).toBe('organizer')
  })
})

describe('the international-transfer list is derived from the SAME disclosure', () => {
  it('never names a processor the tenant does not use', () => {
    // Naming "Vercel, Slack, Resend, WorkOS" on every tenant was the same defect
    // one section further down the privacy page.
    const disclosure = buildSubprocessorDisclosure(facts())
    const names = internationalTransferProcessors(disclosure).map((p) => p.name)
    expect(names).toContain('Vercel.com')
    expect(names).toContain('Resend.com')
    expect(names).not.toContain('Slack')
    expect(names).not.toContain('WorkOS (AuthKit)')
  })

  it('includes Slack and WorkOS once the tenant actually uses them', () => {
    const disclosure = buildSubprocessorDisclosure(
      facts({ slackToken: true, workshops: true }),
    )
    const names = internationalTransferProcessors(disclosure).map((p) => p.name)
    expect(names).toContain('Slack')
    expect(names).toContain('WorkOS (AuthKit)')
  })

  it('lists only processors that have a location', () => {
    const disclosure = buildSubprocessorDisclosure(facts())
    expect(
      internationalTransferProcessors(disclosure).every((p) => p.location),
    ).toBe(true)
  })
})
