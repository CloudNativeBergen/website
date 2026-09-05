import { describe, it, expect } from 'vitest'
import {
  UpdateHomepageSectionsSchema,
  UpdatePublicFreeTicketsSchema,
  UpdateTicketingIdsSchema,
} from './conference'
import {
  UNSAFE_LINK_MESSAGE,
  UNSAFE_RICH_TEXT_LINK_MESSAGE,
} from '@/lib/portabletext/safeHref'

describe('UpdateTicketingIdsSchema — Tito cross-field validation', () => {
  it('accepts a full Tito binding', () => {
    const r = UpdateTicketingIdsSchema.safeParse({
      ticketingProvider: 'tito',
      titoAccountSlug: 'acme',
      titoEventSlug: 'acme-2026',
    })
    expect(r.success).toBe(true)
  })

  it('accepts clearing both slugs', () => {
    const r = UpdateTicketingIdsSchema.safeParse({
      ticketingProvider: 'tito',
      titoAccountSlug: null,
      titoEventSlug: null,
    })
    expect(r.success).toBe(true)
  })

  it('rejects a Tito provider with only one slug (both-or-neither)', () => {
    const r = UpdateTicketingIdsSchema.safeParse({
      ticketingProvider: 'tito',
      titoAccountSlug: 'acme',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['titoEventSlug'])
    }
  })

  it('rejects a lone slug even without the provider field (half-configured state)', () => {
    const r = UpdateTicketingIdsSchema.safeParse({
      titoEventSlug: 'acme-2026',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['titoAccountSlug'])
    }
  })

  it('rejects complete Tito slugs while the provider is absent (would be silently ignored)', () => {
    const r = UpdateTicketingIdsSchema.safeParse({
      titoAccountSlug: 'acme',
      titoEventSlug: 'acme-2026',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['ticketingProvider'])
    }
  })

  it('rejects complete Tito slugs while the provider is explicitly checkin', () => {
    const r = UpdateTicketingIdsSchema.safeParse({
      ticketingProvider: 'checkin',
      titoAccountSlug: 'acme',
      titoEventSlug: 'acme-2026',
    })
    expect(r.success).toBe(false)
  })

  it('leaves the Checkin path unconstrained by the Tito rule', () => {
    const r = UpdateTicketingIdsSchema.safeParse({
      checkinCustomerId: 1,
      checkinEventId: 2,
    })
    expect(r.success).toBe(true)
  })
})

// The id is interpolated into a Sanity attribute filter server-side, so the
// int+positive constraints are load-bearing, not cosmetic.
describe('UpdatePublicFreeTicketsSchema — one per-type opt-in row (#860)', () => {
  it('accepts both directions of a toggle', () => {
    expect(
      UpdatePublicFreeTicketsSchema.safeParse({ ticketId: 7, visible: true })
        .success,
    ).toBe(true)
    expect(
      UpdatePublicFreeTicketsSchema.safeParse({ ticketId: 7, visible: false })
        .success,
    ).toBe(true)
  })

  it.each([
    ['a fractional id', { ticketId: 1.5, visible: true }],
    ['a zero id', { ticketId: 0, visible: true }],
    ['a negative id', { ticketId: -7, visible: true }],
    ['a string id', { ticketId: '7', visible: true }],
    ['a missing visible flag', { ticketId: 7 }],
  ])('rejects %s', (_name, input) => {
    expect(UpdatePublicFreeTicketsSchema.safeParse(input).success).toBe(false)
  })
})

// Two link gates with two different scheme sets share this schema, so each
// rejection has to quote ITS OWN rule: rich-text prose may link `mailto:`, a
// CTA button may not. Reporting the button message on a rich-text rejection
// would describe a rule that was never applied.
describe('link rejection messages match the gate that rejected', () => {
  const richTextSection = (href: string) => ({
    homepageSections: [
      {
        _type: 'homepageRichText',
        _key: 'r',
        content: [
          {
            _type: 'block',
            _key: 'b1',
            markDefs: [{ _type: 'link', _key: 'l1', href }],
            children: [{ _type: 'span', _key: 's1', text: 'x', marks: ['l1'] }],
          },
        ],
      },
    ],
  })

  const ctaSection = (buttonHref: string) => ({
    homepageSections: [
      {
        _type: 'homepageCtaBanner',
        _key: 'c',
        heading: 'Join us',
        buttonLabel: 'Get tickets',
        buttonHref,
      },
    ],
  })

  it('reports the rich-text message — mailto included — for a rich-text link', () => {
    const r = UpdateHomepageSectionsSchema.safeParse(
      richTextSection('javascript:alert(1)'),
    )
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message)).toContain(
        UNSAFE_RICH_TEXT_LINK_MESSAGE,
      )
    }
  })

  it('accepts the mailto: the rich-text message advertises', () => {
    const r = UpdateHomepageSectionsSchema.safeParse(
      richTextSection('mailto:hi@example.com'),
    )
    expect(r.success).toBe(true)
  })

  it('reports the stricter button message for a CTA link', () => {
    const r = UpdateHomepageSectionsSchema.safeParse(
      ctaSection('javascript:alert(1)'),
    )
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message)).toContain(
        UNSAFE_LINK_MESSAGE,
      )
    }
  })

  it('still refuses mailto: on a CTA button, as its message says', () => {
    const r = UpdateHomepageSectionsSchema.safeParse(
      ctaSection('mailto:hi@example.com'),
    )
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message)).toContain(
        UNSAFE_LINK_MESSAGE,
      )
    }
  })
})
