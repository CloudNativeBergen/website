import { canonicalHost, canonicalOrigin, canonicalUrl } from '../canonical'
import type { Conference } from '@/lib/conference/types'

function makeConference(domains: string[]): Conference {
  return { domains } as Conference
}

describe('canonicalHost', () => {
  it('uses the conference primary domain over the request host', () => {
    const conference = makeConference([
      '2099.cloudnativedays.no',
      'cloudnativedays.no',
    ])
    expect(canonicalHost(conference, 'preview.vercel.app')).toBe(
      '2099.cloudnativedays.no',
    )
  })

  it('skips wildcard domain patterns when picking the primary domain', () => {
    const conference = makeConference([
      '*.cloudnativedays.no',
      '2099.cloudnativedays.no',
    ])
    expect(canonicalHost(conference, 'preview.vercel.app')).toBe(
      '2099.cloudnativedays.no',
    )
  })

  it('falls back to the request host when no conference resolved', () => {
    expect(canonicalHost(null, 'localhost:3000')).toBe('localhost:3000')
    expect(canonicalHost(undefined, 'preview.vercel.app')).toBe(
      'preview.vercel.app',
    )
  })

  it('falls back to the request host when domains is empty', () => {
    expect(canonicalHost(makeConference([]), 'localhost:3000')).toBe(
      'localhost:3000',
    )
  })
})

describe('canonicalOrigin', () => {
  it('uses https for production conference domains', () => {
    const conference = makeConference(['cloudnativebergen.dev'])
    expect(canonicalOrigin(conference, 'localhost:3000')).toBe(
      'https://cloudnativebergen.dev',
    )
  })

  it('uses http for localhost when no conference resolved', () => {
    expect(canonicalOrigin(null, 'localhost:3000')).toBe(
      'http://localhost:3000',
    )
  })
})

describe('canonicalUrl', () => {
  const conference = makeConference(['cloudnativebergen.dev'])

  it('builds an absolute URL on the canonical host regardless of request host', () => {
    // Served from a preview host, but the canonical still points at production.
    expect(canonicalUrl(conference, 'preview.vercel.app', '/program')).toBe(
      'https://cloudnativebergen.dev/program',
    )
  })

  it('returns the bare origin for the site root', () => {
    expect(canonicalUrl(conference, 'preview.vercel.app', '/')).toBe(
      'https://cloudnativebergen.dev',
    )
    expect(canonicalUrl(conference, 'preview.vercel.app', '')).toBe(
      'https://cloudnativebergen.dev',
    )
  })

  it('normalizes a path without a leading slash', () => {
    expect(canonicalUrl(conference, 'preview.vercel.app', 'speaker/jane')).toBe(
      'https://cloudnativebergen.dev/speaker/jane',
    )
  })

  it('keeps localhost self-referential when no conference resolved', () => {
    expect(canonicalUrl(null, 'localhost:3000', '/tickets')).toBe(
      'http://localhost:3000/tickets',
    )
  })
})
