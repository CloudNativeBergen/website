import { describe, expect, it } from 'vitest'
import { buildDirectionsUrl } from './venue'

describe('buildDirectionsUrl', () => {
  it('constructs a maps search URL from name + address, URL-encoded', () => {
    const url = buildDirectionsUrl('Grieghallen', 'Edvard Griegs plass 1')
    expect(url).toBe(
      'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent('Grieghallen, Edvard Griegs plass 1'),
    )
  })

  it('works with only a name or only an address', () => {
    expect(buildDirectionsUrl('Grieghallen', undefined)).toContain(
      encodeURIComponent('Grieghallen'),
    )
    expect(buildDirectionsUrl(undefined, 'Somewhere 1')).toContain(
      encodeURIComponent('Somewhere 1'),
    )
  })

  it('trims parts and skips blank ones', () => {
    const url = buildDirectionsUrl('  Grieghallen  ', '   ')
    expect(url).toBe(
      'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent('Grieghallen'),
    )
  })

  it('returns null when there is nothing to search for', () => {
    expect(buildDirectionsUrl(undefined, undefined)).toBeNull()
    expect(buildDirectionsUrl('  ', '')).toBeNull()
  })

  it('only ever produces a plain https maps URL (no tenant-entered scheme)', () => {
    const url = buildDirectionsUrl('javascript:alert(1)', 'x')
    expect(url?.startsWith('https://www.google.com/maps/search/')).toBe(true)
  })
})
