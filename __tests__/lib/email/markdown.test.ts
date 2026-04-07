import { describe, it, expect } from 'vitest'
import {
  portableTextBodyToMarkdown,
  markdownToPortableTextBody,
} from '@/lib/email/markdown'
import type { PortableTextBlock } from '@portabletext/types'

// Helper to strip generated _key fields for structural comparison.
// Also normalizes mark references: replaces markDef keys in both
// markDefs and children.marks with sequential placeholders.
function stripKeys(blocks: PortableTextBlock[]): unknown[] {
  return blocks.map((block) => {
    const { _key: _bk, ...rest } = block as unknown as Record<string, unknown>

    // Build a mapping from original markDef keys to sequential placeholders
    const rawMarkDefs = (rest.markDefs as Array<Record<string, unknown>>) || []
    const keyMap = new Map<string, string>()
    rawMarkDefs.forEach((md, i) => {
      if (typeof md._key === 'string') {
        keyMap.set(md._key, `ref-${i}`)
      }
    })

    const markDefs = rawMarkDefs.map(({ _key: _mk, ...m }) => m)

    const children = (rest.children as Array<Record<string, unknown>>)?.map(
      ({ _key: _ck, ...c }) => ({
        ...c,
        marks: ((c.marks as string[]) || []).map(
          (mark) => keyMap.get(mark) ?? mark,
        ),
      }),
    )

    return { ...rest, children, markDefs }
  })
}

// Helper to assert round-trip: markdown → PT → markdown produces same text.
// Normalizes italic syntax and trailing whitespace since the library may
// use _ instead of * and may add trailing spaces for hard breaks.
function assertRoundTrip(markdown: string) {
  const pt = markdownToPortableTextBody(markdown)
  const backToMd = portableTextBodyToMarkdown(pt)
  const normalize = (s: string) =>
    s
      .trim()
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      // Normalize *italic* → _italic_ for comparison
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '_$1_')
  expect(normalize(backToMd)).toBe(normalize(markdown))
}

describe('portableTextBodyToMarkdown', () => {
  it('returns empty string for empty array', () => {
    expect(portableTextBodyToMarkdown([])).toBe('')
  })

  it('returns empty string for null-ish input', () => {
    expect(
      portableTextBodyToMarkdown(null as unknown as PortableTextBlock[]),
    ).toBe('')
    expect(
      portableTextBodyToMarkdown(undefined as unknown as PortableTextBlock[]),
    ).toBe('')
  })

  it('converts a simple paragraph', () => {
    const blocks: PortableTextBlock[] = [
      {
        _type: 'block',
        _key: 'a1',
        style: 'normal',
        markDefs: [],
        children: [
          { _type: 'span', _key: 's1', text: 'Hello world', marks: [] },
        ],
      },
    ]
    expect(portableTextBodyToMarkdown(blocks)).toBe('Hello world')
  })

  it('converts bold and italic marks', () => {
    const blocks: PortableTextBlock[] = [
      {
        _type: 'block',
        _key: 'a1',
        style: 'normal',
        markDefs: [],
        children: [
          { _type: 'span', _key: 's1', text: 'Hello ', marks: [] },
          { _type: 'span', _key: 's2', text: 'bold', marks: ['strong'] },
          { _type: 'span', _key: 's3', text: ' and ', marks: [] },
          { _type: 'span', _key: 's4', text: 'italic', marks: ['em'] },
        ],
      },
    ]
    // Library uses underscore style for italic
    expect(portableTextBodyToMarkdown(blocks)).toBe(
      'Hello **bold** and _italic_',
    )
  })

  it('converts links with markDefs', () => {
    const blocks: PortableTextBlock[] = [
      {
        _type: 'block',
        _key: 'a1',
        style: 'normal',
        markDefs: [
          { _key: 'lnk1', _type: 'link', href: 'https://example.com' },
        ],
        children: [
          { _type: 'span', _key: 's1', text: 'Visit ', marks: [] },
          { _type: 'span', _key: 's2', text: 'our site', marks: ['lnk1'] },
        ],
      },
    ]
    expect(portableTextBodyToMarkdown(blocks)).toBe(
      'Visit [our site](https://example.com)',
    )
  })

  it('converts headings', () => {
    const blocks: PortableTextBlock[] = [
      {
        _type: 'block',
        _key: 'a1',
        style: 'h1',
        markDefs: [],
        children: [{ _type: 'span', _key: 's1', text: 'Title', marks: [] }],
      },
      {
        _type: 'block',
        _key: 'a2',
        style: 'h2',
        markDefs: [],
        children: [{ _type: 'span', _key: 's2', text: 'Subtitle', marks: [] }],
      },
    ]
    expect(portableTextBodyToMarkdown(blocks)).toBe('# Title\n\n## Subtitle')
  })

  it('converts multiple paragraphs', () => {
    const blocks: PortableTextBlock[] = [
      {
        _type: 'block',
        _key: 'a1',
        style: 'normal',
        markDefs: [],
        children: [
          { _type: 'span', _key: 's1', text: 'Paragraph one.', marks: [] },
        ],
      },
      {
        _type: 'block',
        _key: 'a2',
        style: 'normal',
        markDefs: [],
        children: [
          { _type: 'span', _key: 's2', text: 'Paragraph two.', marks: [] },
        ],
      },
    ]
    expect(portableTextBodyToMarkdown(blocks)).toBe(
      'Paragraph one.\n\nParagraph two.',
    )
  })
})

describe('markdownToPortableTextBody', () => {
  it('returns empty array for empty string', () => {
    expect(markdownToPortableTextBody('')).toEqual([])
  })

  it('returns empty array for whitespace-only', () => {
    expect(markdownToPortableTextBody('   \n  ')).toEqual([])
  })

  it('converts a simple paragraph', () => {
    const result = markdownToPortableTextBody('Hello world')
    expect(result).toHaveLength(1)
    expect(result[0]._type).toBe('block')
    expect(result[0].style).toBe('normal')

    const children = result[0].children as Array<{ text: string }>
    expect(children).toHaveLength(1)
    expect(children[0].text).toBe('Hello world')
  })

  it('converts bold and italic', () => {
    const result = markdownToPortableTextBody('Hello **bold** and *italic*')
    const children = result[0].children as Array<{
      text: string
      marks: string[]
    }>
    expect(children.length).toBeGreaterThanOrEqual(3)

    const boldSpan = children.find((c) => c.text === 'bold')
    expect(boldSpan?.marks).toContain('strong')

    const italicSpan = children.find((c) => c.text === 'italic')
    expect(italicSpan?.marks).toContain('em')
  })

  it('converts links', () => {
    const result = markdownToPortableTextBody(
      'Visit [our site](https://example.com)',
    )
    const markDefs = result[0].markDefs as Array<{
      _type: string
      href: string
      _key: string
    }>
    expect(markDefs).toHaveLength(1)
    expect(markDefs[0]._type).toBe('link')
    expect(markDefs[0].href).toBe('https://example.com')

    const children = result[0].children as Array<{
      text: string
      marks: string[]
    }>
    const linkSpan = children.find((c) => c.text === 'our site')
    expect(linkSpan?.marks).toContain(markDefs[0]._key)
  })

  it('converts headings', () => {
    const result = markdownToPortableTextBody('# Title\n\n## Subtitle')
    expect(result).toHaveLength(2)
    expect(result[0].style).toBe('h1')
    expect(result[1].style).toBe('h2')
  })

  it('converts unordered lists', () => {
    const result = markdownToPortableTextBody('- Item one\n- Item two')
    expect(result).toHaveLength(2)
    expect(result[0].listItem).toBe('bullet')
    expect(result[1].listItem).toBe('bullet')
  })

  it('converts ordered lists', () => {
    const result = markdownToPortableTextBody('1. First\n2. Second')
    expect(result).toHaveLength(2)
    expect(result[0].listItem).toBe('number')
    expect(result[1].listItem).toBe('number')
  })
})

describe('round-trip fidelity', () => {
  it('round-trips a plain paragraph', () => {
    assertRoundTrip('Hello world')
  })

  it('round-trips bold and italic', () => {
    assertRoundTrip('Hello **bold** and *italic* text')
  })

  it('round-trips links', () => {
    assertRoundTrip('Visit [our site](https://example.com) for more')
  })

  it('round-trips headings', () => {
    assertRoundTrip('# Title\n\n## Subtitle')
  })

  it('round-trips multiple paragraphs', () => {
    assertRoundTrip('First paragraph.\n\nSecond paragraph.')
  })

  it('round-trips unordered lists', () => {
    assertRoundTrip('- Item one\n- Item two\n- Item three')
  })

  it('round-trips ordered lists', () => {
    assertRoundTrip('1. First\n2. Second\n3. Third')
  })

  it('round-trips mixed content resembling a real email template', () => {
    // In production, template variables are resolved *before* markdown
    // conversion, so we test with realistic resolved values.
    const md = [
      '# Sponsor Invitation',
      '',
      'Dear **Yves and Petter**,',
      '',
      'We would like to invite Acme Corp to sponsor Cloud Native Days Norway 2026.',
      '',
      'Benefits:',
      '',
      '- Brand visibility',
      '- Booth space',
      '- Speaking slot',
      '',
      'Learn more at [our website](https://cloudnativedays.no).',
      '',
      'Best regards,',
      'Hans',
    ].join('\n')
    assertRoundTrip(md)
  })
})

describe('edge cases', () => {
  it('handles template variables in text without mangling', () => {
    const blocks = markdownToPortableTextBody(
      'Hello {{{CONTACT_NAMES}}}, welcome to {{{CONFERENCE_TITLE}}}!',
    )
    const md = portableTextBodyToMarkdown(blocks)
    expect(md).toContain('{{{CONTACT_NAMES}}}')
    expect(md).toContain('{{{CONFERENCE_TITLE}}}')
  })

  it('handles template variables inside link hrefs (URL-encoded by library)', () => {
    const blocks = markdownToPortableTextBody(
      'Visit [the website]({{{CONFERENCE_URL}}})',
    )
    const markDefs = blocks[0].markDefs as unknown as Array<{ href: string }>
    // The library URL-encodes braces in hrefs — this is expected.
    // The server-side variable substitution runs *before* markdown conversion,
    // so actual URLs will be valid when the email is sent.
    expect(markDefs[0].href).toContain('CONFERENCE_URL')
  })

  it('preserves structural equality through PT→MD→PT (ignoring keys)', () => {
    const original: PortableTextBlock[] = [
      {
        _type: 'block',
        _key: 'orig1',
        style: 'normal',
        markDefs: [
          { _key: 'lnk1', _type: 'link', href: 'https://example.com' },
        ],
        children: [
          { _type: 'span', _key: 's1', text: 'Hello ', marks: [] },
          { _type: 'span', _key: 's2', text: 'bold', marks: ['strong'] },
          { _type: 'span', _key: 's3', text: ' and ', marks: [] },
          { _type: 'span', _key: 's4', text: 'link', marks: ['lnk1'] },
        ],
      },
    ]

    const md = portableTextBodyToMarkdown(original)
    const reconstructed = markdownToPortableTextBody(md)

    expect(stripKeys(reconstructed)).toEqual(stripKeys(original))
  })
})
