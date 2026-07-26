import { describe, it, expect } from 'vitest'
import { deriveBlueskyHandle, STREAM_CONFIG } from './config'

describe('deriveBlueskyHandle (CaaS #625)', () => {
  it('extracts the handle from a bsky.app profile URL', () => {
    expect(
      deriveBlueskyHandle(['https://bsky.app/profile/kcd.bergen.dev']),
    ).toBe('kcd.bergen.dev')
  })

  it('ignores non-Bluesky links and finds the Bluesky one', () => {
    expect(
      deriveBlueskyHandle([
        'https://twitter.com/kcd',
        'https://www.linkedin.com/company/kcd',
        'https://bsky.app/profile/kcd.dev',
      ]),
    ).toBe('kcd.dev')
  })

  it('strips a leading @ and decodes URL-encoding', () => {
    expect(deriveBlueskyHandle(['https://bsky.app/profile/@kcd.dev'])).toBe(
      'kcd.dev',
    )
  })

  it('returns null when there is no Bluesky link (feed is omitted)', () => {
    expect(deriveBlueskyHandle(['https://twitter.com/kcd'])).toBeNull()
    expect(deriveBlueskyHandle([])).toBeNull()
    expect(deriveBlueskyHandle(undefined)).toBeNull()
  })

  it('no longer carries a hardcoded brand handle in the static config', () => {
    expect('handle' in STREAM_CONFIG.blueskyFeed).toBe(false)
  })
})
