import { describe, expect, it } from 'vitest'
import { PLATFORM_CONSTRAINTS, validatePublishInput } from '../constraints'
import { ManualChannelProvider, postUrlIssue } from '../manual'

const input = (text: string) => ({ text, media: [], link: undefined })

describe('ManualChannelProvider (spec §4.2, #1006)', () => {
  const provider = new ManualChannelProvider('linkedin')

  it('is the LinkedIn adapter with the platform constraints as its constraints object', () => {
    expect(provider.platform).toBe('linkedin')
    expect(provider.constraints).toBe(PLATFORM_CONSTRAINTS.linkedin)
    expect(provider.constraints.maxLength).toBe(3000)
    expect(provider.constraints.linkPlacement).toBe('comment')
  })

  it('passes the tenant context through to the shared rules (#1134)', () => {
    const inBody = input(
      'Tickets → https://cloudnativebergen.no/tickets?utm_source=linkedin',
    )
    const context = { conferenceDomains: ['cloudnativebergen.no'] }
    expect(provider.validate(inBody, context)).toEqual(
      validatePublishInput(PLATFORM_CONSTRAINTS.linkedin, inBody, context),
    )
    expect(provider.validate(inBody, context)).toEqual([
      {
        field: 'body',
        message: expect.stringContaining('first comment'),
      },
    ])
    // Without the tenant's domains the host rule has nothing to compare to.
    expect(provider.validate(inBody)).toEqual([])
  })

  it('validates exactly as the editor does (same function, same rules)', () => {
    const tooLong = input('x'.repeat(3001))
    expect(provider.validate(tooLong)).toEqual(
      validatePublishInput(PLATFORM_CONSTRAINTS.linkedin, tooLong),
    )
    expect(provider.validate(tooLong)[0]?.message).toContain('3001')
    expect(provider.validate(input('Tickets are live'))).toEqual([])
  })

  it('publish is a typed refusal, never a post: a manual channel is executed by hand', async () => {
    const outcome = await provider.publish(input('Tickets are live'))
    expect(outcome).toMatchObject({ ok: false, kind: 'rejected' })
    if (!outcome.ok) expect(outcome.message).toMatch(/by hand/i)
  })
})

describe('postUrlIssue — the pasted URL must be on the platform', () => {
  it.each([
    'https://www.linkedin.com/posts/cloudnativebergen_activity-123',
    'https://www.linkedin.com/feed/update/urn:li:activity:123/',
    'https://no.linkedin.com/posts/abc',
    'https://linkedin.com/posts/abc',
  ])('accepts %s for LinkedIn', (url) => {
    expect(postUrlIssue('linkedin', url)).toBeNull()
  })

  it.each([
    ['http://www.linkedin.com/posts/abc', /https/],
    ['https://bsky.app/profile/x/post/y', /linkedin\.com/i],
    ['https://www.linkedin.com.evil.example/posts/abc', /linkedin\.com/i],
    ['https://evil.example/www.linkedin.com/posts', /linkedin\.com/i],
    ['https://www.linkedin.com@evil.example/posts', /linkedin\.com/i],
    ['https://notlinkedin.com/posts/abc', /linkedin\.com/i],
    ['https://www.linkedin.com', /path/i],
    ['not a url', /https/],
  ])('refuses %s for LinkedIn', (url, message) => {
    expect(postUrlIssue('linkedin', url)).toMatch(message)
  })

  it('knows the Bluesky post host too', () => {
    expect(
      postUrlIssue('bluesky', 'https://bsky.app/profile/a/post/b'),
    ).toBeNull()
    expect(
      postUrlIssue('bluesky', 'https://www.linkedin.com/posts/abc'),
    ).toMatch(/bsky\.app/)
  })

  it('X still answers on twitter.com; Threads on both of its domains', () => {
    expect(postUrlIssue('x', 'https://twitter.com/cndn/status/1')).toBeNull()
    expect(postUrlIssue('x', 'https://x.com/cndn/status/1')).toBeNull()
    expect(
      postUrlIssue('threads', 'https://www.threads.net/@cndn/post/1'),
    ).toBeNull()
  })

  it('a platform with no fixed host (Mastodon instances) only requires https and a path', () => {
    expect(postUrlIssue('mastodon', 'https://hachyderm.io/@cndn/1')).toBeNull()
    expect(postUrlIssue('mastodon', 'http://hachyderm.io/@cndn/1')).toMatch(
      /https/,
    )
  })
})
