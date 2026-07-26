import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resolveConferenceFrom,
  resolveConferenceContact,
  platformFallbackFrom,
  platformFallbackContact,
} from './from'

describe('email from/contact resolution (CaaS #625)', () => {
  const OLD = process.env.EMAIL_FALLBACK_FROM

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    delete process.env.EMAIL_FALLBACK_FROM
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (OLD === undefined) delete process.env.EMAIL_FALLBACK_FROM
    else process.env.EMAIL_FALLBACK_FROM = OLD
  })

  describe('resolveConferenceFrom', () => {
    it('prefers the explicit field with the organizer name', () => {
      expect(
        resolveConferenceFrom({
          organizer: 'KCD Bergen',
          contactEmail: 'hi@kcd.dev',
          domains: ['2026.kcd.dev'],
        }),
      ).toBe('KCD Bergen <hi@kcd.dev>')
    })

    it('honors the field + localPart options for sponsor mail', () => {
      expect(
        resolveConferenceFrom(
          { organizer: 'KCD', sponsorEmail: 'sales@kcd.dev' },
          { field: 'sponsorEmail', localPart: 'sponsors' },
        ),
      ).toBe('KCD <sales@kcd.dev>')
    })

    it('derives <localPart>@<domain> when the field is absent', () => {
      expect(
        resolveConferenceFrom(
          { organizer: 'KCD', domains: ['2026.kcd.dev'] },
          { field: 'sponsorEmail', localPart: 'sponsors' },
        ),
      ).toBe('KCD <sponsors@2026.kcd.dev>')
    })

    it('uses the neutral env fallback (never a brand) when nothing resolves', () => {
      process.env.EMAIL_FALLBACK_FROM = 'Platform <noreply@platform.test>'
      const warn = vi.spyOn(console, 'warn')
      const result = resolveConferenceFrom({ title: 'Orphan Conf' })
      expect(result).toBe('Platform <noreply@platform.test>')
      expect(warn).toHaveBeenCalled()
    })

    it('never returns a hardcoded brand address', () => {
      const result = resolveConferenceFrom({ title: 'Orphan Conf' })
      expect(result.toLowerCase()).not.toContain('cloudnativeday')
      expect(result.toLowerCase()).not.toContain('cloudnativebergen')
    })
  })

  describe('resolveConferenceContact', () => {
    it('prefers contactEmail', () => {
      expect(resolveConferenceContact({ contactEmail: 'hello@kcd.dev' })).toBe(
        'hello@kcd.dev',
      )
    })

    it('derives contact@domain when contactEmail is absent', () => {
      expect(resolveConferenceContact({ domains: ['2026.kcd.dev'] })).toBe(
        'contact@2026.kcd.dev',
      )
    })

    it('falls back to the neutral platform contact (no brand)', () => {
      const result = resolveConferenceContact({ title: 'Orphan Conf' })
      expect(result).toBe(platformFallbackContact())
      expect(result.toLowerCase()).not.toContain('cloudnative')
    })
  })

  describe('platform fallback', () => {
    it('reads EMAIL_FALLBACK_FROM and extracts the bare address', () => {
      process.env.EMAIL_FALLBACK_FROM = 'Platform <noreply@platform.test>'
      expect(platformFallbackFrom()).toBe('Platform <noreply@platform.test>')
      expect(platformFallbackContact()).toBe('noreply@platform.test')
    })

    it('uses a brand-free default when the env var is unset', () => {
      expect(platformFallbackFrom().toLowerCase()).not.toContain('cloudnative')
    })
  })
})
