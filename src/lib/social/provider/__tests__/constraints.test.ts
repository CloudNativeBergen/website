import { describe, expect, it } from 'vitest'
import {
  PLATFORM_CONSTRAINTS,
  countLength,
  getPlatformConstraints,
  validatePublishInput,
} from '../constraints'

const media = (alt = 'A crowd at the keynote') => ({
  url: 'https://cdn.sanity.io/images/p/d/a.jpg',
  mimeType: 'image/jpeg',
  alt,
})

describe('platform constraints', () => {
  it('LinkedIn counts characters up to 3,000 and puts the link in the first comment', () => {
    const c = PLATFORM_CONSTRAINTS.linkedin
    expect(c.maxLength).toBe(3000)
    expect(c.counting).toBe('characters')
    expect(c.linkPlacement).toBe('comment')
  })

  it('Bluesky counts graphemes up to 300, takes at most four images, and shows the link as a card', () => {
    const c = PLATFORM_CONSTRAINTS.bluesky
    expect(c.maxLength).toBe(300)
    expect(c.counting).toBe('graphemes')
    expect(c.maxImages).toBe(4)
    expect(c.linkPlacement).toBe('card')
  })

  it('has no constraints for a platform without an adapter', () => {
    expect(getPlatformConstraints('mastodon')).toBeNull()
  })
})

describe('countLength', () => {
  it('counts a flag emoji as one grapheme but many characters', () => {
    // 🇳🇴 is two code points (four UTF-16 units) and one grapheme.
    expect(countLength('🇳🇴', 'graphemes')).toBe(1)
    expect(countLength('🇳🇴', 'characters')).toBe(4)
  })
})

describe('validatePublishInput', () => {
  const bluesky = PLATFORM_CONSTRAINTS.bluesky
  const linkedin = PLATFORM_CONSTRAINTS.linkedin

  it('accepts a body within the limit with no media', () => {
    expect(
      validatePublishInput(bluesky, { text: 'Tickets are live', media: [] }),
    ).toEqual([])
  })

  it('refuses an empty body', () => {
    const issues = validatePublishInput(linkedin, { text: '   ', media: [] })
    expect(issues).toEqual([
      { field: 'body', message: expect.stringMatching(/empty/i) },
    ])
  })

  it('refuses a Bluesky body of 301 graphemes and accepts 300', () => {
    const ok = validatePublishInput(bluesky, {
      text: '🇳🇴'.repeat(300),
      media: [],
    })
    expect(ok).toEqual([])
    const over = validatePublishInput(bluesky, {
      text: '🇳🇴'.repeat(301),
      media: [],
    })
    expect(over).toEqual([
      { field: 'body', message: expect.stringMatching(/301.*300/) },
    ])
  })

  it('refuses a fifth Bluesky image', () => {
    const issues = validatePublishInput(bluesky, {
      text: 'x',
      media: [media(), media(), media(), media(), media()],
    })
    expect(issues).toEqual([
      { field: 'media', message: expect.stringMatching(/4/) },
    ])
  })

  it('refuses a Bluesky image without alt text', () => {
    const issues = validatePublishInput(bluesky, {
      text: 'x',
      media: [media(''), media('   ')],
    })
    expect(issues).toEqual([
      { field: 'media', message: expect.stringMatching(/alt/i) },
    ])
  })

  it('does not require alt text where the platform does not (LinkedIn)', () => {
    expect(
      validatePublishInput(linkedin, { text: 'x', media: [media('')] }),
    ).toEqual([])
  })

  it('refuses an image type the platform does not accept', () => {
    const issues = validatePublishInput(bluesky, {
      text: 'x',
      media: [{ ...media(), mimeType: 'image/svg+xml' }],
    })
    expect(issues).toEqual([
      { field: 'media', message: expect.stringMatching(/svg/i) },
    ])
  })

  it('refuses a link that is not http(s)', () => {
    const issues = validatePublishInput(linkedin, {
      text: 'x',
      media: [],
      link: 'javascript:alert(1)',
    })
    expect(issues).toEqual([
      { field: 'link', message: expect.stringMatching(/https?/) },
    ])
  })
})

describe('the link card displaces images (#1005)', () => {
  const link = 'https://cloudnativedays.no/tickets?utm_source=bluesky'
  const image = {
    url: 'https://cdn.sanity.io/x.png',
    mimeType: 'image/png',
    alt: 'a',
  }

  it('refuses a second image alongside a link on Bluesky; one image (the thumbnail) is fine', () => {
    const bluesky = PLATFORM_CONSTRAINTS.bluesky
    expect(
      validatePublishInput(bluesky, { text: 'Hi', media: [image], link }),
    ).toEqual([])
    expect(
      validatePublishInput(bluesky, { text: 'Hi', media: [image, image] }),
    ).toEqual([])
    expect(
      validatePublishInput(bluesky, {
        text: 'Hi',
        media: [image, image],
        link,
      }),
    ).toEqual([
      {
        field: 'media',
        message: expect.stringContaining('keep one image or drop the link'),
      },
    ])
    expect(
      validatePublishInput(PLATFORM_CONSTRAINTS.linkedin, {
        text: 'Hi',
        media: [image, image],
        link,
      }),
    ).toEqual([])
  })

  it('enforces the 3,000-byte cap alongside the 300-grapheme cap', () => {
    // 200 family emoji: 200 graphemes, 11 code units and 25 bytes each —
    // within both platforms' length limits, over Bluesky's byte cap only.
    const text = '👨‍👩‍👧‍👧'.repeat(200)
    expect(
      validatePublishInput(PLATFORM_CONSTRAINTS.bluesky, { text, media: [] }),
    ).toEqual([{ field: 'body', message: '5000 bytes, the limit is 3000.' }])
    expect(
      validatePublishInput(PLATFORM_CONSTRAINTS.linkedin, { text, media: [] }),
    ).toEqual([])
  })
})

/**
 * Spec §3.1 (#1134): where the platform posts the link as the FIRST COMMENT,
 * the body may not carry a link to the conference's own site. The rule is on
 * the HOST, never an exact match against `input.link`: the body's URL is
 * frozen when the Task is materialized while `link` is re-derived at save and
 * again at approval, so the two differ in exactly the cases that matter.
 */
describe('the link is the first comment (#1134)', () => {
  const OWN = ['cloudnativebergen.no', '*.konf.app']
  const linkedin = PLATFORM_CONSTRAINTS.linkedin
  const bluesky = PLATFORM_CONSTRAINTS.bluesky

  const body = (text: string) => ({ text, media: [] })

  it('refuses a LinkedIn body carrying the tagged link to our own site', () => {
    const issues = validatePublishInput(
      linkedin,
      {
        ...body(
          'Tickets are live → https://cloudnativebergen.no/tickets?utm_source=linkedin&utm_campaign=earlyBird',
        ),
        // Re-derived at approval: a DIFFERENT string from the one in the body.
        link: 'https://cloudnativebergen.no/tickets?utm_source=linkedin&utm_campaign=finalPush',
      },
      { conferenceDomains: OWN },
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe('body')
    expect(issues[0].message).toContain('first comment')
    expect(issues[0].message).toContain(
      'https://cloudnativebergen.no/tickets?utm_source=linkedin&utm_campaign=earlyBird',
    )
  })

  it('refuses an UNTAGGED body link and one tagged for an earlier target page', () => {
    for (const url of [
      'https://cloudnativebergen.no/tickets',
      'https://cloudnativebergen.no/cfp?utm_source=linkedin&utm_campaign=cfp',
      'http://cloudnativebergen.no/',
    ]) {
      const issues = validatePublishInput(linkedin, body(`Read more: ${url}`), {
        conferenceDomains: OWN,
      })
      expect(
        issues.map((i) => i.field),
        url,
      ).toEqual(['body'])
      expect(issues[0].message, url).toContain(url)
    }
  })

  it('reads the URL the way a browser would: case, trailing punctuation, port, userinfo, a subdomain of ours', () => {
    for (const url of [
      'HTTPS://CloudNativeBergen.NO/tickets',
      'https://cloudnativebergen.no:8443/tickets',
      'https://x@cloudnativebergen.no/tickets',
      'https://www.cloudnativebergen.no/tickets',
    ]) {
      const issues = validatePublishInput(linkedin, body(`Read more: ${url}`), {
        conferenceDomains: OWN,
      })
      expect(
        issues.map((i) => i.field),
        url,
      ).toEqual(['body'])
    }
    // Sentence punctuation around the URL is trimmed off the URL the message
    // names — copy written by hand ends a link with a full stop far more
    // often than a URL legitimately ends with one.
    for (const text of [
      'Tickets (https://cloudnativebergen.no/tickets).',
      'Tickets: https://cloudnativebergen.no/tickets,',
      'See [tickets](https://cloudnativebergen.no/tickets) now',
    ]) {
      const issues = validatePublishInput(linkedin, body(text), {
        conferenceDomains: OWN,
      })
      expect(
        issues.map((i) => i.field),
        text,
      ).toEqual(['body'])
      expect(issues[0].message, text).toContain(
        'remove https://cloudnativebergen.no/tickets from the text.',
      )
    }
  })

  it('matches a domains[] entry that carries a dev port, which the generated URL keeps', () => {
    // `conferenceBaseUrl` derives `http://localhost:3000/...` from the entry
    // `localhost:3000`, but `URL.hostname` is `localhost`. Comparing the two
    // as stored would never match the URL we generated ourselves.
    for (const [entry, url] of [
      ['localhost:3000', 'http://localhost:3000/tickets'],
      ['example.com:8443', 'https://example.com:8443/tickets'],
    ] as const) {
      const issues = validatePublishInput(linkedin, body(`Tickets → ${url}`), {
        conferenceDomains: [entry],
      })
      expect(
        issues.map((i) => i.field),
        entry,
      ).toEqual(['body'])
      expect(issues[0].message, entry).toContain(url)
    }
  })

  it('treats the SITE as ours, not only the listed host: apex, www and siblings of the edition entry', () => {
    // Production lists the edition host (`2026.cloudnativedays.no`). The URL
    // an organizer types by hand is the apex, which redirects straight to
    // it; `www.` and a sibling subdomain land on the same site too.
    for (const url of [
      'https://cloudnativedays.no/tickets',
      'https://www.cloudnativedays.no/tickets',
      'https://blog.cloudnativedays.no/post',
    ]) {
      const issues = validatePublishInput(linkedin, body(`Tickets → ${url}`), {
        conferenceDomains: ['2026.cloudnativedays.no'],
      })
      expect(
        issues.map((i) => i.field),
        url,
      ).toEqual(['body'])
    }
  })

  it('reads a fully-qualified host (trailing dot) and a bare www. host as the same site', () => {
    // WHATWG parsing keeps the terminal dot, DNS does not; LinkedIn
    // autolinks a bare `www.` host exactly as a full URL.
    for (const url of [
      'https://cloudnativebergen.no./tickets',
      'www.cloudnativebergen.no/tickets',
    ]) {
      const issues = validatePublishInput(linkedin, body(`Tickets → ${url}`), {
        conferenceDomains: OWN,
      })
      expect(
        issues.map((i) => i.field),
        url,
      ).toEqual(['body'])
      expect(issues[0].message, url).toContain(url)
    }
  })

  it('ignores WILDCARD entries: a hosting zone is not a site, and other tenants share it', () => {
    // Production lists `*.vercel.app` for previews. Every speaker demo on the
    // same zone would otherwise read as ours — and on `*.konf.app` so would
    // another tenant's edition.
    for (const [entries, url] of [
      [['*.vercel.app'], 'https://speaker-demo.vercel.app/'],
      [OWN, 'https://sub.konf.app/x'],
      [OWN, 'https://my.konf.app/x'],
    ] as const) {
      expect(
        validatePublishInput(linkedin, body(`See ${url}`), {
          conferenceDomains: entries,
        }),
        url,
      ).toEqual([])
    }
  })

  it('keeps sites on a shared PRIVATE suffix apart: our vercel.app project is not every vercel.app project', () => {
    expect(
      validatePublishInput(linkedin, body('https://cndn.vercel.app/tickets'), {
        conferenceDomains: ['cndn.vercel.app'],
      }).map((i) => i.field),
    ).toEqual(['body'])
    expect(
      validatePublishInput(linkedin, body('https://demo.vercel.app/tickets'), {
        conferenceDomains: ['cndn.vercel.app'],
      }),
    ).toEqual([])
  })

  it('names the Recipe as the place to fix, because materializing keeps re-creating the link', () => {
    const [issue] = validatePublishInput(
      linkedin,
      body('https://cloudnativebergen.no/tickets'),
      { conferenceDomains: OWN },
    )
    expect(issue.message).toContain('Recipe')
  })

  it('is not fooled by a host that merely ENDS with ours', () => {
    expect(
      validatePublishInput(
        linkedin,
        body('https://cloudnativebergen.no.evil.example/x'),
        { conferenceDomains: OWN },
      ),
    ).toEqual([])
  })

  it('leaves URLs on other hosts alone', () => {
    expect(
      validatePublishInput(
        linkedin,
        body(
          'The CNCF landscape (https://landscape.cncf.io) is worth a look. Also https://notcloudnativebergen.no/x',
        ),
        { conferenceDomains: OWN },
      ),
    ).toEqual([])
  })

  it('accepts a LinkedIn body with no link at all, and one that only names us', () => {
    expect(
      validatePublishInput(
        linkedin,
        {
          ...body('Tickets are live. Link in the comments.'),
          link: 'https://cloudnativebergen.no/tickets',
        },
        { conferenceDomains: OWN },
      ),
    ).toEqual([])
    expect(
      validatePublishInput(
        linkedin,
        body('See cloudnativebergen.no for the programme'),
        { conferenceDomains: OWN },
      ),
    ).toEqual([])
  })

  it('leaves Bluesky (a link CARD) untouched with the same body and domains', () => {
    expect(
      validatePublishInput(
        bluesky,
        {
          ...body('Tickets are live → https://cloudnativebergen.no/tickets'),
          link: 'https://cloudnativebergen.no/tickets',
        },
        { conferenceDomains: OWN },
      ),
    ).toEqual([])
  })

  it('says nothing when the conference has no domains to compare against', () => {
    expect(
      validatePublishInput(
        linkedin,
        body('Tickets → https://cloudnativebergen.no/tickets'),
        { conferenceDomains: [] },
      ),
    ).toEqual([])
    expect(
      validatePublishInput(
        linkedin,
        body('Tickets → https://cloudnativebergen.no/tickets'),
      ),
    ).toEqual([])
  })
})
