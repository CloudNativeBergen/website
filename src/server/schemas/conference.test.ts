import { describe, it, expect } from 'vitest'
import { UpdateTicketingIdsSchema } from './conference'

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
