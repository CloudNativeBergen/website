import { describe, it, expect } from 'vitest'
import {
  ANALYTICS_EVENTS,
  CTA_CAPTURE_ATTR,
  CAPTURE_ATTR_PREFIX,
  POSTHOG_TOKEN_PATTERN,
  resolvePirschCode,
  resolvePosthogToken,
} from './analytics'

describe('resolvePosthogToken', () => {
  it('accepts a public phc_ project token, trimmed', () => {
    expect(
      resolvePosthogToken(
        '  phc_AtRfmihK9AhZtiupD4mFCukbYiUEwQystESTSQvbq5gh ',
      ),
    ).toBe('phc_AtRfmihK9AhZtiupD4mFCukbYiUEwQystESTSQvbq5gh')
  })

  it('resolves absent and blank values to undefined', () => {
    expect(resolvePosthogToken(undefined)).toBeUndefined()
    expect(resolvePosthogToken(null)).toBeUndefined()
    expect(resolvePosthogToken('   ')).toBeUndefined()
  })

  it('rejects anything that is not a phc_ token', () => {
    // A personal API key must never end up in the page.
    expect(resolvePosthogToken('phx_abcdefghijklmnopqrstuvwxyz0123')).toBe(
      undefined,
    )
    expect(resolvePosthogToken('phc_short')).toBeUndefined()
    // The value is serialised into the document, so no punctuation at all.
    expect(
      resolvePosthogToken('phc_AtRfmihK9AhZtiupD4mFCukbYiUEwQystESTSQ"><'),
    ).toBeUndefined()
  })

  it('exports the same pattern the write-path validators use', () => {
    expect(
      POSTHOG_TOKEN_PATTERN.test(
        'phc_AtRfmihK9AhZtiupD4mFCukbYiUEwQystESTSQvbq5gh',
      ),
    ).toBe(true)
  })
})

describe('the analytics event catalogue', () => {
  it('keeps the same 21 names under the PostHog catalogue', () => {
    const names = Object.values(ANALYTICS_EVENTS)
    expect(names).toHaveLength(21)
    expect(new Set(names).size).toBe(21)
    expect(ANALYTICS_EVENTS.ticketsHero).toBe('cta-tickets-hero')
    expect(ANALYTICS_EVENTS.outboundCheckinTicketsPage).toBe(
      'outbound-checkin-tickets-page',
    )
    // The attribution query groups on these prefixes (spec §6.2).
    for (const name of names) {
      expect(name).toMatch(/^(cta|outbound)-/)
    }
  })

  it('names the CTA capture attribute PostHog autocapture reads', () => {
    expect(CTA_CAPTURE_ATTR).toBe('data-ph-capture-attribute-cta')
    expect(CTA_CAPTURE_ATTR.startsWith(CAPTURE_ATTR_PREFIX)).toBe(true)
  })
})

describe('resolvePirschCode (kept until the last organization has switched)', () => {
  it('still resolves a valid code', () => {
    expect(resolvePirschCode('Jc72d7tD73Ai9raeYVPeXJ0OhEJrrvaK')).toBe(
      'Jc72d7tD73Ai9raeYVPeXJ0OhEJrrvaK',
    )
  })
})
