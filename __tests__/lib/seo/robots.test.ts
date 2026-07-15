import { DISALLOWED_PATHS, getBaseUrl, buildRobots } from '@/lib/seo/robots'

describe('getBaseUrl', () => {
  it('uses http for localhost hosts', () => {
    expect(getBaseUrl('localhost:3000')).toBe('http://localhost:3000')
  })

  it('uses https for public tenant domains', () => {
    expect(getBaseUrl('cloudnativebergen.dev')).toBe(
      'https://cloudnativebergen.dev',
    )
  })
})

describe('buildRobots', () => {
  const robots = buildRobots('cloudnativebergen.dev')
  const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules

  it('allows general crawling', () => {
    expect(rule?.allow).toBe('/')
    expect(rule?.userAgent).toBe('*')
  })

  it('points the sitemap at the current host', () => {
    expect(robots.sitemap).toBe('https://cloudnativebergen.dev/sitemap.xml')
  })

  it('derives the sitemap host per-request', () => {
    const local = buildRobots('localhost:3000')
    expect(local.sitemap).toBe('http://localhost:3000/sitemap.xml')
  })

  it('disallows private, portal, token and api prefixes', () => {
    const disallow = rule?.disallow ?? []
    for (const path of [
      '/admin',
      '/api',
      '/stream',
      '/workshop',
      '/signin',
      '/cli',
      '/invitation',
      '/sponsor/contract/sign/',
      '/sponsor/onboarding/',
      '/sponsor/portal/',
      '/cfp/submit',
      '/cfp/list',
    ]) {
      expect(disallow).toContain(path)
    }
  })

  it('does NOT disallow public marketing or public cfp/sponsor pages', () => {
    const disallow = [...DISALLOWED_PATHS]
    // Public marketing pages must remain crawlable.
    expect(disallow).not.toContain('/')
    expect(disallow).not.toContain('/program')
    expect(disallow).not.toContain('/speaker')
    // The bare /cfp landing and public sponsor pages stay allowed; only their
    // private sub-paths are listed.
    expect(disallow).not.toContain('/cfp')
    expect(disallow).not.toContain('/sponsor')
    expect(disallow).not.toContain('/sponsor/terms')
  })
})
