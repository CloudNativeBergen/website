import { describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'alias.example' }),
}))
vi.mock('@/lib/conference/visibility', () => ({
  getDiscoveryVisibilityForDomain: async () => ({ discoverable: true }),
}))
const conference = {
  _id: 'conf-a',
  domains: ['conf.example', 'alias.example'],
  programDate: '2999-01-01',
}
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: async () => ({ conference }),
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeakers: async () => ({ speakers: [{ slug: 'ada' }] }),
}))

import sitemap from './sitemap'

describe('sitemap', () => {
  it('lists canonical-host URLs, not the request host', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain('https://conf.example/')
    expect(urls).toContain('https://conf.example/speaker/ada')
    expect(urls.some((u) => u.includes('alias.example'))).toBe(false)
  })

  it('leaves out /program until the programme is published', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).not.toContain('https://conf.example/program')
    conference.programDate = '2000-01-01'
    expect((await sitemap()).map((e) => e.url)).toContain(
      'https://conf.example/program',
    )
  })
})
