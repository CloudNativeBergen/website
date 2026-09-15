import { describe, expect, it, vi } from 'vitest'
import {
  LANDING_UTM_KEY,
  landingUtmFrom,
  recallLandingUtm,
  rememberLandingUtm,
  rememberLandingUtmTags,
} from './landing-utm'

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  }
}

describe('landingUtmFrom', () => {
  it('reads the four tags from a query string', () => {
    expect(
      landingUtmFrom(
        '?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=cfp:launch:bluesky&utm_term=x',
      ),
    ).toEqual({
      source: 'bluesky',
      medium: 'social',
      campaign: 'cfp',
      content: 'cfp:launch:bluesky',
    })
  })

  it('reads the same tags out of a Next searchParams object, first value wins', () => {
    expect(
      landingUtmFrom({
        utm_campaign: ['cfp', 'tickets'],
        utm_source: 'linkedin',
        id: 'ignored',
      }),
    ).toEqual({ campaign: 'cfp', source: 'linkedin' })
  })

  it('is null for a plain arrival and for blank tags', () => {
    expect(landingUtmFrom('')).toBeNull()
    expect(landingUtmFrom('?ref=friend')).toBeNull()
    expect(landingUtmFrom('?utm_campaign=&utm_source=%20%20')).toBeNull()
  })

  it('drops an absurdly long tag rather than storing it', () => {
    expect(
      landingUtmFrom(`?utm_campaign=${'x'.repeat(201)}&utm_source=bluesky`),
    ).toEqual({ source: 'bluesky' })
  })
})

describe('rememberLandingUtm — first touch wins', () => {
  it('remembers the tags of a tagged landing', () => {
    const storage = memoryStorage()
    rememberLandingUtm(storage, '?utm_campaign=cfp')
    expect(JSON.parse(storage.map.get(LANDING_UTM_KEY) as string)).toEqual({
      campaign: 'cfp',
    })
  })

  it('does NOT overwrite an earlier landing', () => {
    const storage = memoryStorage({
      [LANDING_UTM_KEY]: JSON.stringify({ campaign: 'cfp' }),
    })
    rememberLandingUtm(storage, '?utm_campaign=tickets')
    expect(recallLandingUtm(storage)).toEqual({ campaign: 'cfp' })
  })

  it('writes nothing at all for an untagged landing', () => {
    // EMPTY storage, so nothing but the no-tags guard can stop the write.
    const empty = memoryStorage()
    rememberLandingUtm(empty, '')
    rememberLandingUtm(empty, '?ref=friend')
    expect(empty.map.size).toBe(0)
    expect(recallLandingUtm(empty)).toBeNull()
  })

  it('so an untagged landing cannot clear an earlier tagged one', () => {
    const storage = memoryStorage({
      [LANDING_UTM_KEY]: JSON.stringify({ campaign: 'cfp' }),
    })
    rememberLandingUtm(storage, '')
    expect(recallLandingUtm(storage)).toEqual({ campaign: 'cfp' })
  })

  it('survives a browser with no usable storage', () => {
    const throwing = {
      getItem: vi.fn(() => {
        throw new DOMException('denied')
      }),
      setItem: vi.fn(() => {
        throw new DOMException('denied')
      }),
    }
    expect(() =>
      rememberLandingUtm(throwing, '?utm_campaign=cfp'),
    ).not.toThrow()
    expect(() => rememberLandingUtm(null, '?utm_campaign=cfp')).not.toThrow()
    expect(recallLandingUtm(throwing)).toBeNull()
    expect(recallLandingUtm(null)).toBeNull()
  })
})

describe('recallLandingUtm', () => {
  it('returns nothing when nothing was remembered', () => {
    expect(recallLandingUtm(memoryStorage())).toBeNull()
  })

  it('ignores a corrupt or hostile stored value instead of trusting it', () => {
    expect(
      recallLandingUtm(memoryStorage({ [LANDING_UTM_KEY]: 'not json' })),
    ).toBeNull()
    expect(
      recallLandingUtm(memoryStorage({ [LANDING_UTM_KEY]: '"a string"' })),
    ).toBeNull()
    expect(
      recallLandingUtm(
        memoryStorage({
          [LANDING_UTM_KEY]: JSON.stringify({ campaign: { evil: true } }),
        }),
      ),
    ).toBeNull()
    expect(
      recallLandingUtm(
        memoryStorage({
          [LANDING_UTM_KEY]: JSON.stringify({
            campaign: 'x'.repeat(500),
            source: 'bluesky',
          }),
        }),
      ),
    ).toEqual({ source: 'bluesky' })
  })
})

describe('rememberLandingUtmTags — a tagged arrival at the form is a landing too', () => {
  it('remembers tags already in hand', () => {
    const storage = memoryStorage()
    rememberLandingUtmTags(storage, { campaign: 'cfp', source: 'bluesky' })
    expect(recallLandingUtm(storage)).toEqual({
      campaign: 'cfp',
      source: 'bluesky',
    })
  })

  it('still lets the FIRST touch win', () => {
    const storage = memoryStorage({
      [LANDING_UTM_KEY]: JSON.stringify({ campaign: 'cfp' }),
    })
    rememberLandingUtmTags(storage, { campaign: 'tickets' })
    expect(recallLandingUtm(storage)).toEqual({ campaign: 'cfp' })
  })

  it('writes nothing for no tags, and survives absent storage', () => {
    const storage = memoryStorage()
    rememberLandingUtmTags(storage, null)
    expect(storage.map.size).toBe(0)
    expect(() =>
      rememberLandingUtmTags(null, { campaign: 'cfp' }),
    ).not.toThrow()
  })
})
