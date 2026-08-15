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

  it('leaves the controller UNRESOLVED when neither org nor organizer is set', () => {
    // #848: this used to fall back to `PLATFORM_NAME`, so a tenant's privacy
    // policy named the PLATFORM as its data controller — misdirecting every
    // Article 15-21 request. There is no fallback any more.
    const legal = buildLegalConfig(
      conf({ organizer: '' as unknown as string }),
      null,
    )
    expect(legal.controllerName).toBe('')
    expect(legal.controllerResolved).toBe(false)
    expect(legal.controllerName).not.toBe('Konf')
  })

  it('reports a resolved controller in the other direction', () => {
    expect(buildLegalConfig(conf(), null).controllerResolved).toBe(true)
  })
})

describe('buildLegalConfig — a FAILED organization read is not an absent one', () => {
  it('flags the identity as unconfirmed rather than silently defaulting', () => {
    const legal = buildLegalConfig(conf(), null, {
      organizationReadFailed: true,
    })
    expect(legal.identityReadFailed).toBe(true)
  })

  it('never names the platform when the read failed and the conference is bare', () => {
    const legal = buildLegalConfig(
      conf({ organizer: '' as unknown as string }),
      null,
      { organizationReadFailed: true },
    )
    expect(legal.controllerResolved).toBe(false)
    expect(legal.controllerName).toBe('')
  })

  it('is false for an ordinary successful read — the other direction', () => {
    expect(buildLegalConfig(conf(), null).identityReadFailed).toBe(false)
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

  it('prefers the REGISTERED legal entity over the display name', () => {
    // Not hypothetical: the existing tenant's visa letters name the company
    // "Cloud Native Bergen" (org. no. 933 338 622) while the conference — and
    // the organization's display name — is "Cloud Native Days Norway". The
    // controller on /privacy must be the entity, not the brand.
    const legal = buildLegalConfig(conf(), {
      name: 'Cloud Native Days Norway',
      legalEntityName: 'Cloud Native Bergen',
    })
    expect(legal.controllerName).toBe('Cloud Native Bergen')
    expect(legal.controllerResolved).toBe(true)
  })

  it('falls back to the display name when no legal entity is set', () => {
    const legal = buildLegalConfig(conf(), { name: 'Cloud Native Days Norway' })
    expect(legal.controllerName).toBe('Cloud Native Days Norway')
  })

  it.each([['   '], ['']])(
    'falls back to the display name when the legal entity is blank (%j)',
    (legalEntityName) => {
      // A cleared field must not out-rank a real name. kontroll unsets rather
      // than storing an empty string, but a legacy or Studio-entered blank
      // must degrade the same way.
      const legal = buildLegalConfig(conf(), {
        name: 'Cloud Native Days Norway',
        legalEntityName,
      })
      expect(legal.controllerName).toBe('Cloud Native Days Norway')
    },
  )

  it('uses the legal entity even when the org has no display name', () => {
    const legal = buildLegalConfig(conf(), {
      legalEntityName: 'Cloud Native Bergen',
    })
    expect(legal.controllerName).toBe('Cloud Native Bergen')
  })

  it('trims the legal entity rather than printing the padding', () => {
    const legal = buildLegalConfig(conf(), {
      legalEntityName: '  Cloud Native Bergen  ',
    })
    expect(legal.controllerName).toBe('Cloud Native Bergen')
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

  it('keeps the venue city and canonicalizes casing when the org jurisdiction override matches the conference country', () => {
    const legal = buildLegalConfig(conf(), { legalJurisdiction: 'norway' })
    expect(legal.location).toBe('Bergen, Norway')
    expect(legal.jurisdiction).toBe('Norway')
    expect(legal.isNorway).toBe(true)
  })
})

describe('buildLegalConfig — supervisory-authority URL safety', () => {
  it('keeps http(s) URLs and drops unsafe schemes', () => {
    const withUrl = (url: string) =>
      buildLegalConfig(conf(), {
        supervisoryAuthority: { name: 'Some DPA', url },
      }).supervisoryAuthority.url
    expect(withUrl('https://dpa.example')).toBe('https://dpa.example')
    expect(withUrl('http://dpa.example')).toBe('http://dpa.example')
    expect(withUrl('javascript:alert(1)')).toBeUndefined()
    expect(withUrl('data:text/html,x')).toBeUndefined()
    expect(withUrl('not a url')).toBeUndefined()
  })
})
