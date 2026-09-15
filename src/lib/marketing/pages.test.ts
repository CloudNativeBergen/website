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
