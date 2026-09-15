import { describe, it, expect } from 'vitest'
import { taggedUrl } from './link'

const base = {
  baseUrl: 'https://cloudnativebergen.dev',
  channel: 'linkedin' as const,
  campaignKey: 'cfp',
  taskKey: 'cfpOpen:linkedin',
}

describe('taggedUrl', () => {
  it('derives the four UTM parameters from channel, campaign and task', () => {
    const url = new URL(taggedUrl({ ...base, targetPage: '/cfp' }))
    expect(url.origin).toBe('https://cloudnativebergen.dev')
    expect(url.pathname).toBe('/cfp')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: 'linkedin',
      utm_medium: 'social',
      utm_campaign: 'cfp',
      utm_content: 'cfpOpen:linkedin',
    })
  })

  it('encodes key characters so the link survives a copy-paste', () => {
    const url = taggedUrl({
      ...base,
      targetPage: '/program',
      taskKey: 'speakerCard:sp-1:bluesky',
      channel: 'bluesky',
    })
    expect(url).toBe(
      'https://cloudnativebergen.dev/program?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=speakerCard%3Asp-1%3Abluesky',
    )
  })

  it('keeps existing query parameters on the picked page, ours winning', () => {
    const url = new URL(
      taggedUrl({ ...base, targetPage: '/tickets?ref=x&utm_source=old#top' }),
    )
    expect(url.searchParams.get('ref')).toBe('x')
    expect(url.searchParams.get('utm_source')).toBe('linkedin')
    expect(url.hash).toBe('#top')
  })

  it('tolerates a base URL with a trailing slash or path', () => {
    expect(
      taggedUrl({ ...base, baseUrl: 'https://cndn.no/', targetPage: '/' }),
    ).toBe(
      'https://cndn.no/?utm_source=linkedin&utm_medium=social&utm_campaign=cfp&utm_content=cfpOpen%3Alinkedin',
    )
  })

  it('refuses a target that is not a site path', () => {
    expect(() => taggedUrl({ ...base, targetPage: 'tickets' })).toThrow(
      /starting with/,
    )
    expect(() =>
      taggedUrl({ ...base, targetPage: 'https://evil.example/x' }),
    ).toThrow(/starting with/)
  })

  it('refuses a protocol-relative target that leaves our domain', () => {
    expect(() =>
      taggedUrl({ ...base, targetPage: '//evil.example/tickets' }),
    ).toThrow(/leaves/)
  })
})
