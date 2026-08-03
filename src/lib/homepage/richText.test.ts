import { describe, expect, it } from 'vitest'
import {
  emptyRichTextBlock,
  fromRichTextSegments,
  isRichTextContentEmpty,
  RICH_TEXT_LIMITS,
  sanitizeRichTextContent,
  toRichTextSegments,
  type RichTextCalloutBlock,
  type RichTextCodeBlock,
  type RichTextImageBlock,
  type RichTextProseBlock,
  type RichTextTableBlock,
} from './richText'

/**
 * A sanitizer without adversarial tests is decoration. Everything under
 * "attacks" is a payload an organizer (or anyone who got hold of an organizer
 * session, or who can write to the dataset directly) could realistically store,
 * asserted against the RENDER-side half of the contract — the half that has to
 * hold even when the validating write path was bypassed entirely.
 */

const REAL_REF = `image-${'a'.repeat(40)}-1600x900-jpg`

function prose(text: string, extra: Record<string, unknown> = {}) {
  return {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', _key: 's1', text, marks: [] }],
    ...extra,
  }
}

function linked(href: string) {
  return {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    markDefs: [{ _type: 'link', _key: 'l1', href }],
    children: [{ _type: 'span', _key: 's1', text: 'click me', marks: ['l1'] }],
  }
}

describe('sanitizeRichTextContent — attacks', () => {
  it('drops a link whose href is a javascript: URL, and the mark with it', () => {
    const [block] = sanitizeRichTextContent([
      linked('javascript:alert(document.cookie)'),
    ]) as RichTextProseBlock[]
    expect(block.markDefs).toEqual([])
    expect(block.children[0].marks).toEqual([])
    // The visible text survives — only the dangerous behaviour is removed.
    expect(block.children[0].text).toBe('click me')
  })

  it.each([
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    '\tjavascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'jAvAsCrIpT:void(0)',
    'vbscript:msgbox(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'data:image/svg+xml,<svg onload=alert(1)>',
    'blob:https://evil.example/1234',
    'file:///etc/passwd',
    '//evil.example/phish',
    '\\\\evil.example\\share',
    'https:evil.example',
    'https://',
    'about:blank',
    'chrome://settings',
    'intent://scan#Intent;scheme=zxing;end',
  ])('rejects the href %j', (href) => {
    const [block] = sanitizeRichTextContent([
      linked(href),
    ]) as RichTextProseBlock[]
    expect(block.markDefs).toEqual([])
  })

  it.each([
    '/tickets',
    'https://cloudnativebergen.dev/cfp',
    'http://example.com',
    'mailto:organizers@example.com',
  ])('keeps the safe href %j', (href) => {
    const [block] = sanitizeRichTextContent([
      linked(href),
    ]) as RichTextProseBlock[]
    expect(block.markDefs).toEqual([{ _type: 'link', _key: 'l1', href }])
    expect(block.children[0].marks).toEqual(['l1'])
  })

  it('strips arbitrary attributes smuggled onto a link annotation', () => {
    const [block] = sanitizeRichTextContent([
      {
        _type: 'block',
        _key: 'b1',
        markDefs: [
          {
            _type: 'link',
            _key: 'l1',
            href: 'https://example.com',
            onclick: 'alert(1)',
            onmouseover: 'alert(2)',
            target: '_top',
            rel: '',
            style: 'position:fixed;inset:0',
            srcdoc: '<script>alert(1)</script>',
          },
        ],
        children: [{ _type: 'span', _key: 's1', text: 'x', marks: ['l1'] }],
      },
    ]) as RichTextProseBlock[]
    expect(Object.keys(block.markDefs[0]).sort()).toEqual([
      '_key',
      '_type',
      'href',
    ])
  })

  it('strips arbitrary attributes smuggled onto a block or a span', () => {
    const [block] = sanitizeRichTextContent([
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        className: 'fixed inset-0 z-50',
        onClick: 'alert(1)',
        dangerouslySetInnerHTML: { __html: '<script>alert(1)</script>' },
        markDefs: [],
        children: [
          {
            _type: 'span',
            _key: 's1',
            text: 'hi',
            marks: [],
            style: 'color:red',
            onerror: 'alert(1)',
          },
        ],
      },
    ]) as RichTextProseBlock[]
    expect(Object.keys(block).sort()).toEqual([
      '_key',
      '_type',
      'children',
      'markDefs',
      'style',
    ])
    expect(Object.keys(block.children[0]).sort()).toEqual([
      '_key',
      '_type',
      'marks',
      'text',
    ])
  })

  it.each([
    'html',
    'rawHtml',
    'script',
    'iframe',
    'embed',
    'object',
    'style',
    'homepageHero',
    '__proto__',
    'constructor',
  ])('drops the unmodelled block type %j', (type) => {
    expect(
      sanitizeRichTextContent([
        { _type: type, _key: 'x', html: '<script>alert(1)</script>' },
        prose('kept'),
      ]),
    ).toHaveLength(1)
  })

  it('drops a child that is not a span', () => {
    const [block] = sanitizeRichTextContent([
      {
        _type: 'block',
        _key: 'b1',
        markDefs: [],
        children: [
          { _type: 'script', _key: 'x', text: 'alert(1)' },
          { _type: 'span', _key: 's1', text: 'safe', marks: [] },
        ],
      },
    ]) as RichTextProseBlock[]
    expect(block.children).toHaveLength(1)
    expect(block.children[0].text).toBe('safe')
  })

  it('drops marks that name no surviving annotation and no known decorator', () => {
    const [block] = sanitizeRichTextContent([
      {
        _type: 'block',
        _key: 'b1',
        markDefs: [],
        children: [
          {
            _type: 'span',
            _key: 's1',
            text: 'x',
            marks: ['strong', 'ghost-key', 'onclick', '__proto__'],
          },
        ],
      },
    ]) as RichTextProseBlock[]
    expect(block.children[0].marks).toEqual(['strong'])
  })

  it('never re-points a span at a different link when annotation keys collide', () => {
    const [block] = sanitizeRichTextContent([
      {
        _type: 'block',
        _key: 'b1',
        markDefs: [
          { _type: 'link', _key: 'dup', href: 'https://good.example' },
          { _type: 'link', _key: 'dup', href: 'https://evil.example' },
        ],
        children: [{ _type: 'span', _key: 's1', text: 'x', marks: ['dup'] }],
      },
    ]) as RichTextProseBlock[]
    expect(block.markDefs).toHaveLength(1)
    expect(block.markDefs[0].href).toBe('https://good.example')
  })

  it.each([
    ['a remote URL', 'https://evil.example/tracker.gif'],
    ['a protocol-relative URL', '//evil.example/tracker.gif'],
    ['a data URL', 'data:image/svg+xml,<svg onload=alert(1)>'],
    ['an SVG asset', `image-${'a'.repeat(40)}-100x100-svg`],
    ['a file asset', `file-${'a'.repeat(40)}-pdf`],
    ['a document reference', 'conference-123'],
    ['a traversal suffix', `image-${'a'.repeat(40)}-10x10-png/../../secret`],
    ['a newline-smuggled suffix', `image-${'a'.repeat(40)}-10x10-png\nx`],
    ['an uppercase-hash id', `image-${'A'.repeat(40)}-10x10-png`],
    ['an empty ref', ''],
  ])('drops an image whose asset ref is %s', (_label, ref) => {
    expect(
      sanitizeRichTextContent([
        { _type: 'richTextImage', _key: 'i1', asset: { _ref: ref }, alt: 'x' },
      ]),
    ).toEqual([])
  })

  it('keeps a real asset ref and strips everything else on the image', () => {
    const [block] = sanitizeRichTextContent([
      {
        _type: 'richTextImage',
        _key: 'i1',
        asset: { _type: 'reference', _ref: REAL_REF, url: 'https://evil.test' },
        alt: 'A photo',
        caption: 'Bergen',
        srcSet: 'https://evil.test/x 1x',
        onError: 'alert(1)',
      },
    ]) as RichTextImageBlock[]
    expect(block).toEqual({
      _type: 'richTextImage',
      _key: 'i1',
      asset: { _type: 'reference', _ref: REAL_REF },
      alt: 'A photo',
      caption: 'Bergen',
    })
  })

  it('keeps markup inside a code block as literal text', () => {
    // The code block's whole job is to show text verbatim; escaping is React's
    // job at render. What matters here is that nothing is INTERPRETED.
    const payload = '</code></pre><script>alert(1)</script>'
    const [block] = sanitizeRichTextContent([
      { _type: 'richTextCode', _key: 'c1', language: 'yaml', code: payload },
    ]) as RichTextCodeBlock[]
    expect(block.code).toBe(payload)
  })

  it.each([
    ['<script>', 'not-a-language'],
    ['a class-name payload', 'yaml" onload="alert(1)'],
    ['a non-string', 42],
  ])('falls back to plain text for language %s', (_label, language) => {
    const [block] = sanitizeRichTextContent([
      { _type: 'richTextCode', _key: 'c1', language, code: 'x' },
    ]) as RichTextCodeBlock[]
    expect(block.language).toBe('text')
  })

  it('falls back to a known tone rather than letting one reach a class name', () => {
    const [block] = sanitizeRichTextContent([
      {
        _type: 'richTextCallout',
        _key: 'k1',
        tone: '" onmouseover="alert(1)',
        body: 'hi',
      },
    ]) as RichTextCalloutBlock[]
    expect(block.tone).toBe('info')
  })

  it('falls back to a known style rather than letting one reach a component map', () => {
    const [block] = sanitizeRichTextContent([
      prose('x', { style: 'script', listItem: 'evil', level: 99 }),
    ]) as RichTextProseBlock[]
    expect(block.style).toBe('normal')
    expect(block.listItem).toBeUndefined()
  })

  it('ignores prototype-polluting keys instead of applying them', () => {
    const payload = JSON.parse(
      `[{"_type":"block","_key":"b1","markDefs":[],"__proto__":{"polluted":true},"children":[{"_type":"span","_key":"s1","text":"x","marks":[]}]}]`,
    )
    sanitizeRichTextContent(payload)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it.each([null, undefined, 'string', 42, {}, [[[]]], [null], [undefined]])(
    'returns an empty list for the non-content input %j',
    (input) => {
      expect(sanitizeRichTextContent(input)).toEqual([])
    },
  )

  it('caps oversized payloads instead of storing them whole', () => {
    const huge = sanitizeRichTextContent([
      ...Array.from({ length: RICH_TEXT_LIMITS.blocks + 50 }, (_, i) => ({
        _type: 'block',
        _key: `b${i}`,
        markDefs: [],
        children: [{ _type: 'span', _key: 's', text: 'x', marks: [] }],
      })),
    ])
    expect(huge).toHaveLength(RICH_TEXT_LIMITS.blocks)

    const [long] = sanitizeRichTextContent([
      prose('x'.repeat(RICH_TEXT_LIMITS.spanText + 1000)),
    ]) as RichTextProseBlock[]
    expect(long.children[0].text).toHaveLength(RICH_TEXT_LIMITS.spanText)

    const [code] = sanitizeRichTextContent([
      {
        _type: 'richTextCode',
        _key: 'c1',
        code: 'a'.repeat(RICH_TEXT_LIMITS.code + 1000),
      },
    ]) as RichTextCodeBlock[]
    expect(code.code).toHaveLength(RICH_TEXT_LIMITS.code)

    const [table] = sanitizeRichTextContent([
      {
        _type: 'richTextTable',
        _key: 't1',
        rows: Array.from({ length: RICH_TEXT_LIMITS.tableRows + 20 }, () => ({
          cells: Array.from(
            { length: RICH_TEXT_LIMITS.tableColumns + 5 },
            () => 'x',
          ),
        })),
      },
    ]) as RichTextTableBlock[]
    expect(table.rows).toHaveLength(RICH_TEXT_LIMITS.tableRows)
    expect(table.rows[0].cells).toHaveLength(RICH_TEXT_LIMITS.tableColumns)
  })

  it('bounds the per-span marks scan instead of walking the whole array', () => {
    // A hostile document can carry a million marks on one span; the scan must
    // stop at the cap, and the surviving marks must come from the capped
    // prefix — a real decorator parked past it is NOT rescued.
    const [block] = sanitizeRichTextContent([
      {
        _type: 'block',
        _key: 'b1',
        markDefs: [],
        children: [
          {
            _type: 'span',
            _key: 's1',
            text: 'x',
            marks: [
              ...Array.from(
                { length: RICH_TEXT_LIMITS.marksPerSpan },
                (_, i) => `junk${i}`,
              ),
              'strong',
            ],
          },
        ],
      },
    ]) as RichTextProseBlock[]
    expect(block.children[0].marks).toEqual([])
  })

  it('keeps marks inside the cap', () => {
    const [block] = sanitizeRichTextContent([
      {
        _type: 'block',
        _key: 'b1',
        markDefs: [],
        children: [
          { _type: 'span', _key: 's1', text: 'x', marks: ['strong', 'em'] },
        ],
      },
    ]) as RichTextProseBlock[]
    expect(block.children[0].marks).toEqual(['strong', 'em'])
  })

  it('caps table cell length', () => {
    const [table] = sanitizeRichTextContent([
      {
        _type: 'richTextTable',
        _key: 't1',
        rows: [{ cells: ['x'.repeat(RICH_TEXT_LIMITS.tableCell + 100)] }],
      },
    ]) as RichTextTableBlock[]
    expect(table.rows[0].cells[0]).toHaveLength(RICH_TEXT_LIMITS.tableCell)
  })
})

describe('sanitizeRichTextContent — normalisation', () => {
  it('leaves the vocabulary the existing prose editor emits untouched', () => {
    // Zero-migration: everything a conference could already have stored must
    // survive the tighter model unchanged.
    const legacy = [
      {
        _type: 'block',
        _key: 'a',
        style: 'h1',
        markDefs: [],
        children: [
          { _type: 'span', _key: 's', text: 'Heading', marks: ['strong'] },
        ],
      },
      {
        _type: 'block',
        _key: 'b',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        markDefs: [{ _type: 'link', _key: 'l', href: '/cfp' }],
        children: [{ _type: 'span', _key: 's', text: 'Item', marks: ['l'] }],
      },
      {
        _type: 'block',
        _key: 'c',
        style: 'normal',
        markDefs: [],
        children: [
          {
            _type: 'span',
            _key: 's',
            text: 'em+underline',
            marks: ['em', 'underline'],
          },
        ],
      },
    ]
    expect(sanitizeRichTextContent(legacy)).toEqual(legacy)
  })

  it('gives every array member a unique key, at every level', () => {
    const out = sanitizeRichTextContent([
      {
        _type: 'block',
        children: [
          { _type: 'span', text: 'a', marks: [] },
          { _type: 'span', text: 'b', marks: [] },
        ],
      },
      { _type: 'block', children: [{ _type: 'span', text: 'c', marks: [] }] },
      { _type: 'richTextTable', rows: [{ cells: ['a'] }, { cells: ['b'] }] },
    ])
    const keys = out.map((b) => b._key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.every(Boolean)).toBe(true)
    const table = out[2] as RichTextTableBlock
    expect(new Set(table.rows.map((r) => r._key)).size).toBe(2)
  })

  it('pads ragged table rows so the grid cannot collapse', () => {
    const [table] = sanitizeRichTextContent([
      {
        _type: 'richTextTable',
        _key: 't',
        rows: [{ cells: ['a', 'b', 'c'] }, { cells: ['d'] }],
      },
    ]) as RichTextTableBlock[]
    expect(table.rows[1].cells).toEqual(['d', '', ''])
  })

  it('drops blocks and rows that would render nothing', () => {
    expect(
      sanitizeRichTextContent([
        { _type: 'block', _key: 'a', children: [] },
        { _type: 'richTextCode', _key: 'b', code: '   ' },
        { _type: 'richTextCallout', _key: 'c', body: '  ' },
        { _type: 'richTextTable', _key: 'd', rows: [] },
        { _type: 'richTextImage', _key: 'e' },
      ]),
    ).toEqual([])
  })

  it('reports an all-whitespace prose block as empty', () => {
    expect(
      isRichTextContentEmpty(sanitizeRichTextContent([prose('   ')])),
    ).toBe(true)
    expect(isRichTextContentEmpty(sanitizeRichTextContent([prose('hi')]))).toBe(
      false,
    )
  })

  it('preserves an empty alt, which means "decorative"', () => {
    const [block] = sanitizeRichTextContent([
      { _type: 'richTextImage', _key: 'i', asset: { _ref: REAL_REF } },
    ]) as RichTextImageBlock[]
    expect(block.alt).toBe('')
  })
})

describe('editor segments', () => {
  it('collapses contiguous prose and preserves interleaved order', () => {
    const content = [
      prose('one'),
      prose('two'),
      { _type: 'richTextCode', _key: 'c', code: 'x' },
      prose('three'),
    ]
    const segments = toRichTextSegments(content)
    expect(segments.map((s) => s.kind)).toEqual(['prose', 'object', 'prose'])
    expect(segments[0].kind === 'prose' && segments[0].blocks).toHaveLength(2)
  })

  it('round-trips through segments without reordering or losing anything', () => {
    const content = sanitizeRichTextContent([
      prose('intro'),
      { _type: 'richTextCallout', _key: 'k', tone: 'warning', body: 'note' },
      prose('outro'),
      { _type: 'richTextImage', _key: 'i', asset: { _ref: REAL_REF } },
    ])
    expect(fromRichTextSegments(toRichTextSegments(content))).toEqual(content)
  })

  it('builds blank blocks that the sanitizer would drop until filled in', () => {
    // "Add a table" must give an organizer something to type INTO, but an
    // untouched card must not survive to the published page.
    const blanks = (
      [
        'richTextCode',
        'richTextImage',
        'richTextTable',
        'richTextCallout',
      ] as const
    ).map(emptyRichTextBlock)
    expect(sanitizeRichTextContent(blanks)).toEqual([])
  })
})
