import { describe, it, expect } from 'vitest'
import { pagePickerOptions, sitePathIssue } from './pages'

describe('pagePickerOptions', () => {
  it('offers the fixed own pages when the Task has no subject', () => {
    const paths = pagePickerOptions(null).map((o) => o.path)
    expect(paths).toEqual([
      '/',
      '/tickets',
      '/cfp',
      '/program',
      '/speaker',
      '/sponsor',
      '/info',
    ])
  })

  it('adds the speaker page for a speaker subject with a slug', () => {
    const options = pagePickerOptions({
      type: 'speaker',
      name: 'Ada Lovelace',
      slug: 'ada-lovelace',
    })
    expect(options).toContainEqual({
      key: 'subject',
      label: 'Speaker: Ada Lovelace',
      path: '/speaker/ada-lovelace',
    })
  })

  it('points a talk subject at the programme (no per-talk page exists)', () => {
    const options = pagePickerOptions({
      type: 'talk',
      name: 'Kubernetes at sea',
      slug: null,
    })
    expect(options).toContainEqual({
      key: 'subject',
      label: 'Talk: Kubernetes at sea',
      path: '/program',
    })
  })

  it('points a sponsor subject at the sponsor page', () => {
    const options = pagePickerOptions({
      type: 'sponsor',
      name: 'Acme',
      slug: null,
    })
    expect(options).toContainEqual({
      key: 'subject',
      label: 'Sponsor: Acme',
      path: '/sponsor',
    })
  })

  it('adds no subject page for a speaker without a slug', () => {
    const options = pagePickerOptions({
      type: 'speaker',
      name: 'Nameless',
      slug: null,
    })
    expect(options.some((o) => o.key === 'subject')).toBe(false)
  })
})

describe('sitePathIssue', () => {
  it.each(['/', '/tickets', '/speaker/ada', '/program?day=2#talk'])(
    'accepts %s',
    (path) => {
      expect(sitePathIssue(path)).toBeNull()
    },
  )

  it.each([
    ['/go/abc987', 'a short link'],
    ['/go/ABC987', 'a short link, uppercase'],
    ['/go', 'the short-link root'],
    ['/go/', 'the short-link root with a slash'],
    ['/GO/abc987', 'a short link, uppercase segment'],
    ['/program/../go/abc987', 'a short link reached through ..'],
    ['/go\\abc987', 'a short link written with a backslash'],
  ])('refuses %s (%s) — a link never points at a link (spec 2.3)', (path) => {
    // A Task whose destination is its OWN code, or two Tasks pointing at
    // each other's, is a redirect loop the visitor's browser has to break.
    expect(sitePathIssue(path)).not.toBeNull()
  })

  it('still accepts a path that merely BEGINS with the letters go', () => {
    // The guard is the `/go` SEGMENT, not the prefix: refusing these would
    // quietly make real pages unreachable as destinations.
    expect(sitePathIssue('/going-further')).toBeNull()
    expect(sitePathIssue('/gods')).toBeNull()
  })

  it.each([
    ['', 'empty'],
    ['tickets', 'no leading slash'],
    ['//evil.example', 'protocol-relative'],
    ['/\\evil.example', 'backslash host'],
    ['https://evil.example/', 'absolute URL'],
    ['/a b', 'whitespace'],
    ['/' + 'x'.repeat(500), 'too long'],
  ])('refuses %s (%s)', (path) => {
    expect(sitePathIssue(path)).toEqual(expect.any(String))
  })
})
