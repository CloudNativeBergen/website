import { describe, expect, it } from 'vitest'
import { publishLinkFields } from '../publish-link'
import { shortLinkUrl } from '@/lib/marketing/short-code'

const LONG =
  'https://cloudnativedays.no/program?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=speakerCard%3Asp-1%3Abluesky'

describe('publishLinkFields (short-links spec §2.3)', () => {
  it('a Task variant with a code posts the short link and scrapes its long tagged link', () => {
    expect(
      publishLinkFields(
        { link: LONG, shortCode: 'abc234' },
        'https://cloudnativedays.no',
      ),
    ).toEqual({
      link: 'https://cloudnativedays.no/go/abc234',
      linkDestination: LONG,
    })
  })

  it('a standalone post (no code) posts the link the organizer typed, unchanged', () => {
    const typed = 'https://example.org/anything?ref=x'
    expect(
      publishLinkFields(
        { link: typed, shortCode: null },
        'https://cloudnativedays.no',
      ),
    ).toEqual({ link: typed })
  })

  it('without an origin it never posts a relative link: the long link goes out', () => {
    expect(
      publishLinkFields({ link: LONG, shortCode: 'abc234' }, null),
    ).toEqual({ link: LONG })
  })

  it('no link, no link fields — a code alone posts nothing', () => {
    expect(
      publishLinkFields(
        { link: null, shortCode: 'abc234' },
        'https://cloudnativedays.no',
      ),
    ).toEqual({})
  })
})

describe('shortLinkUrl', () => {
  it('joins origin and code without a double slash', () => {
    expect(shortLinkUrl('https://x.dev/', 'abc234')).toBe(
      'https://x.dev/go/abc234',
    )
    expect(shortLinkUrl('https://x.dev', 'abc234')).toBe(
      'https://x.dev/go/abc234',
    )
  })
})
