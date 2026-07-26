import { afterEach, describe, expect, it, vi } from 'vitest'
import { conferenceBaseUrl } from './baseUrl'
import { platformBaseUrl } from '@/lib/branding/platform'

describe('conferenceBaseUrl', () => {
  it('derives an https origin from the primary domain', () => {
    expect(conferenceBaseUrl({ domains: ['cloudnativebergen.no'] })).toBe(
      'https://cloudnativebergen.no',
    )
  })

  it('normalizes casing and surrounding whitespace', () => {
    expect(conferenceBaseUrl({ domains: ['  CloudNativeBergen.NO  '] })).toBe(
      'https://cloudnativebergen.no',
    )
  })

  it('strips a defensively-stored scheme and trailing slash', () => {
    expect(conferenceBaseUrl({ domains: ['https://example.com/'] })).toBe(
      'https://example.com',
    )
  })

  it('uses the first non-empty domain, skipping blanks', () => {
    expect(conferenceBaseUrl({ domains: ['', '   ', 'second.example'] })).toBe(
      'https://second.example',
    )
  })

  it('uses http for an actual localhost dev domain (with port)', () => {
    expect(conferenceBaseUrl({ domains: ['localhost:3000'] })).toBe(
      'http://localhost:3000',
    )
  })

  it('never yields a localhost URL when a real domain is present', () => {
    expect(
      conferenceBaseUrl({ domains: ['cloudnativebergen.no'] }),
    ).not.toContain('localhost')
  })

  it('falls back LOUDLY to the platform base URL when the conference has no domain', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://platform.example')
    try {
      expect(conferenceBaseUrl({ title: 'No Domain Conf', domains: [] })).toBe(
        'https://platform.example',
      )
      expect(errSpy).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllEnvs()
      errSpy.mockRestore()
    }
  })
})

describe('platformBaseUrl', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('prefers NEXT_PUBLIC_BASE_URL, stripping a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://platform.example/')
    expect(platformBaseUrl()).toBe('https://platform.example')
  })

  it('adds an https scheme when the configured value has none', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'platform.example')
    expect(platformBaseUrl()).toBe('https://platform.example')
  })

  it('falls back to the legacy NEXT_PUBLIC_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_URL', 'https://legacy.example')
    expect(platformBaseUrl()).toBe('https://legacy.example')
  })

  it('falls back to the brand-neutral Vercel deploy URL', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_URL', '')
    vi.stubEnv('VERCEL_URL', 'my-deploy.vercel.app')
    expect(platformBaseUrl()).toBe('https://my-deploy.vercel.app')
  })

  it('degrades to localhost ONLY outside production', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_URL', '')
    vi.stubEnv('VERCEL_URL', '')
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('VERCEL_ENV', '')
    expect(platformBaseUrl()).toBe('http://localhost:3000')
  })

  it('throws loudly in production when nothing is configured (never localhost)', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_URL', '')
    vi.stubEnv('VERCEL_URL', '')
    vi.stubEnv('VERCEL_ENV', 'production')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => platformBaseUrl()).toThrow(/not configured/i)
    expect(errSpy).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })
})
