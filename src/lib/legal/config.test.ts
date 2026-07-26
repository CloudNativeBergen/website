import { describe, it, expect } from 'vitest'
import {
  buildLegalConfig,
  NORWAY_SUPERVISORY_AUTHORITY,
  GENERIC_SUPERVISORY_AUTHORITY,
  type OrganizationLegalFields,
} from './config'
import type { Conference } from '@/lib/conference/types'

// A minimal conference; only the fields buildLegalConfig reads matter.
function conf(overrides: Partial<Conference> = {}): Conference {
  return {
    organizer: 'Cloud Native Days Norway',
    city: 'Bergen',
    country: 'Norway',
    contactEmail: 'contact@cloudnativebergen.dev',
    domains: ['cloudnativebergen.dev'],
    ...overrides,
  } as Conference
}

describe('buildLegalConfig — defaults (existing tenant, no org fields)', () => {
  it('preserves the Cloud Native Days Norway / Bergen / Datatilsynet values', () => {
    const legal = buildLegalConfig(conf(), null)
    expect(legal.controllerName).toBe('Cloud Native Days Norway')
    expect(legal.contactEmail).toBe('contact@cloudnativebergen.dev')
    expect(legal.location).toBe('Bergen, Norway')
    expect(legal.jurisdiction).toBe('Norway')
    expect(legal.isNorway).toBe(true)
    expect(legal.supervisoryAuthority).toEqual(NORWAY_SUPERVISORY_AUTHORITY)
  })

  it('falls back to the conference organizer when the org has no name', () => {
    const legal = buildLegalConfig(conf(), { name: '  ' })
    expect(legal.controllerName).toBe('Cloud Native Days Norway')
  })

  it('uses the neutral platform name when neither org nor organizer is set', () => {
    const legal = buildLegalConfig(
      conf({ organizer: '' as unknown as string }),
      null,
    )
    expect(legal.controllerName).toBe('Cloud Native Days')
  })
})

describe('buildLegalConfig — org overrides', () => {
  it('prefers the organization name and contact email', () => {
    const org: OrganizationLegalFields = {
      name: 'Cloud Native Bergen',
      contactEmail: 'legal@cnb.example',
    }
    const legal = buildLegalConfig(conf(), org)
    expect(legal.controllerName).toBe('Cloud Native Bergen')
    expect(legal.contactEmail).toBe('legal@cnb.example')
  })

  it('honors an explicit non-Norway jurisdiction and renders neutral prose', () => {
    const legal = buildLegalConfig(
      conf({ city: 'Berlin', country: 'Germany' }),
      { legalJurisdiction: 'Germany' },
    )
    expect(legal.jurisdiction).toBe('Germany')
    expect(legal.isNorway).toBe(false)
    expect(legal.location).toBe('Berlin, Germany')
    // No org-configured authority + non-Norway → the generic pointer.
    expect(legal.supervisoryAuthority).toEqual(GENERIC_SUPERVISORY_AUTHORITY)
  })

  it('derives a non-Norway jurisdiction from the conference country', () => {
    const legal = buildLegalConfig(
      conf({ city: 'Amsterdam', country: 'Netherlands' }),
      null,
    )
    expect(legal.jurisdiction).toBe('Netherlands')
    expect(legal.isNorway).toBe(false)
    expect(legal.supervisoryAuthority).toEqual(GENERIC_SUPERVISORY_AUTHORITY)
  })

  it('uses a fully custom supervisory authority when provided', () => {
    const org: OrganizationLegalFields = {
      legalJurisdiction: 'Germany',
      supervisoryAuthority: {
        name: 'Der Bundesbeauftragte für den Datenschutz (BfDI)',
        url: 'https://www.bfdi.bund.de',
        email: 'poststelle@bfdi.bund.de',
      },
    }
    const legal = buildLegalConfig(conf(), org)
    expect(legal.supervisoryAuthority).toEqual({
      name: 'Der Bundesbeauftragte für den Datenschutz (BfDI)',
      url: 'https://www.bfdi.bund.de',
      email: 'poststelle@bfdi.bund.de',
    })
  })

  it('is case-insensitive when detecting Norway', () => {
    const legal = buildLegalConfig(conf(), { legalJurisdiction: 'norway' })
    expect(legal.isNorway).toBe(true)
    expect(legal.supervisoryAuthority).toEqual(NORWAY_SUPERVISORY_AUTHORITY)
  })
})

describe('buildLegalConfig — location assembly', () => {
  it('omits the city when absent', () => {
    const legal = buildLegalConfig(
      conf({ city: undefined, country: 'Norway' }),
      null,
    )
    expect(legal.location).toBe('Norway')
  })

  it('drops the venue city when an org jurisdiction override disagrees with the conference country', () => {
    // The location line describes the CONTROLLER's seat: a German legal entity
    // running a conference in Bergen must not read "Bergen, Germany" — nor keep
    // "Bergen, Norway" next to a German governing-law clause.
    const legal = buildLegalConfig(conf(), { legalJurisdiction: 'Germany' })
    expect(legal.jurisdiction).toBe('Germany')
    expect(legal.location).toBe('Germany')
  })

  it('keeps the venue city when the org jurisdiction override matches the conference country', () => {
    const legal = buildLegalConfig(conf(), { legalJurisdiction: 'norway' })
    expect(legal.location).toBe('Bergen, norway')
    expect(legal.isNorway).toBe(true)
  })
})
