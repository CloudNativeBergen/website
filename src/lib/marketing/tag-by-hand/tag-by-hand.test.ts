import { describe, expect, it } from 'vitest'
import { linkedinCompanyUrl, linkedinProfileUrl } from './links'
import { tagByHandEntries } from './index'

describe('linkedinProfileUrl', () => {
  it('takes the first linkedin.com/in/ link among a speaker’s links', () => {
    expect(
      linkedinProfileUrl([
        'https://vimeo.com/showcase/1/video/2',
        'https://www.linkedin.com/company/acme',
        'https://www.linkedin.com/in/stian-standahl/',
        'https://www.linkedin.com/in/someone-else',
      ]),
    ).toBe('https://www.linkedin.com/in/stian-standahl')
  })

  it('drops the ?locale= query, the fragment and the trailing slash', () => {
    expect(
      linkedinProfileUrl([
        'https://www.linkedin.com/in/tvaterlaus/?locale=en_US#about',
      ]),
    ).toBe('https://www.linkedin.com/in/tvaterlaus')
  })

  it('shows a regional or scheme-less link on the canonical host', () => {
    expect(linkedinProfileUrl(['no.linkedin.com/in/ada-l'])).toBe(
      'https://www.linkedin.com/in/ada-l',
    )
    expect(linkedinProfileUrl(['http://linkedin.com/in/ada-l/'])).toBe(
      'https://www.linkedin.com/in/ada-l',
    )
  })

  it('keeps the profile, not a deeper page of it', () => {
    expect(
      linkedinProfileUrl(['https://www.linkedin.com/in/ada-l/details/skills/']),
    ).toBe('https://www.linkedin.com/in/ada-l')
  })

  it('skips links that are not strings', () => {
    expect(
      linkedinProfileUrl([42, null, 'https://www.linkedin.com/in/ada']),
    ).toBe('https://www.linkedin.com/in/ada')
  })

  it('finds nothing without a profile link', () => {
    expect(linkedinProfileUrl(undefined)).toBeNull()
    expect(linkedinProfileUrl('https://www.linkedin.com/in/ada')).toBeNull()
    expect(linkedinProfileUrl([])).toBeNull()
    expect(
      linkedinProfileUrl([
        'https://www.linkedin.com/in/',
        'https://evil.example/linkedin.com/in/ada',
        'https://linkedin.com.evil.example/in/ada',
        'javascript:alert(1)//linkedin.com/in/ada',
        'not a url',
      ]),
    ).toBeNull()
  })
})

describe('linkedinCompanyUrl', () => {
  it('shows a company page clean', () => {
    expect(
      linkedinCompanyUrl(
        'https://www.linkedin.com/company/acme-inc/?viewAsMember=true',
      ),
    ).toBe('https://www.linkedin.com/company/acme-inc')
    expect(linkedinCompanyUrl('linkedin.com/showcase/acme-cloud/')).toBe(
      'https://www.linkedin.com/showcase/acme-cloud',
    )
    expect(
      linkedinCompanyUrl('https://www.linkedin.com/school/uib/?trk=x'),
    ).toBe('https://www.linkedin.com/school/uib')
  })

  it('refuses anything that is not a LinkedIn page', () => {
    expect(linkedinCompanyUrl(null)).toBeNull()
    expect(linkedinCompanyUrl('')).toBeNull()
    expect(linkedinCompanyUrl('https://acme.example/company/acme')).toBeNull()
    expect(linkedinCompanyUrl('https://www.linkedin.com/')).toBeNull()
    expect(linkedinCompanyUrl('https://www.linkedin.com/company/')).toBeNull()
  })
})

describe('tagByHandEntries', () => {
  it('lists one row per page, in the subject’s order', () => {
    expect(
      tagByHandEntries({
        people: [
          { name: 'Ada', links: ['https://www.linkedin.com/in/ada/'] },
          { name: 'Ada (again)', links: ['linkedin.com/in/ada?x=1'] },
          { name: 'Bob', links: ['https://www.linkedin.com/in/bob'] },
          { name: null, links: ['https://www.linkedin.com/in/nameless'] },
        ],
        company: null,
      }),
    ).toEqual([
      { name: 'Ada', url: 'https://www.linkedin.com/in/ada', kind: 'person' },
      { name: 'Bob', url: 'https://www.linkedin.com/in/bob', kind: 'person' },
    ])
  })
})
