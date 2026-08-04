/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { PortableText } from '@portabletext/react'
import { portableTextComponents } from './components'

/**
 * The href gate asserted where it is REGISTERED, not merely where it is used.
 *
 * `RichTextContent` already proves the homepage renders a hostile link inertly,
 * but it sanitizes the value first — the mark is stripped before `<PortableText>`
 * ever sees it, so that test passes even if this map's `link` entry stopped
 * running. Every OTHER caller (speaker bios, sponsor terms, talk abstracts,
 * workshop descriptions) hands stored blocks to `<PortableText>` with this map
 * and no pre-pass, so `marks.link` IS the only thing standing between a stored
 * `javascript:` href and a live link.
 *
 * That makes this file the regression net for the renderer contract itself: if
 * a `@portabletext/react` upgrade ever changes how a `components.marks` entry is
 * looked up or invoked, the mark silently falls back to the library default —
 * which renders `value.href` verbatim — and these assertions are what notice.
 *
 * Asserted STRUCTURALLY, on the anchor's parsed `href`. A substring check like
 * `not.toContain('javascript:')` is worthless against DOM output: the string
 * survives escaping, so the assertion reads the same whether the scheme is live
 * or inert.
 */

afterEach(cleanup)

function linkBlock(href: unknown) {
  return [
    {
      _type: 'block',
      _key: 'b1',
      style: 'normal',
      markDefs: [{ _key: 'l1', _type: 'link', href }],
      children: [{ _type: 'span', _key: 's1', text: 'click', marks: ['l1'] }],
    },
  ]
}

/** Every anchor's href, read off the DOM rather than out of the markup. */
function hrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a')).map(
    (a) => a.getAttribute('href') ?? '',
  )
}

describe('portableTextComponents gates the link mark', () => {
  it.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(1)'],
    ['  javascript:alert(1)  '],
    ['data:text/html,<script>alert(1)</script>'],
    ['vbscript:msgbox(1)'],
    ['//evil.example/takeover'],
    ['https:evil.example'],
  ])('renders %s as an inert anchor, never a live one', (href) => {
    const { container } = render(
      <PortableText
        value={linkBlock(href)}
        components={portableTextComponents}
      />,
    )

    // The anchor may exist — it just must not carry an executable scheme.
    for (const value of hrefs(container)) {
      expect(value).toBe('#')
    }
    // Proof the mark ran at all: a fallback to the library default would emit
    // the stored href, so an empty anchor list would make the loop vacuous.
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(container.textContent).toContain('click')
  })

  it('leaves the schemes rich text is allowed to use alone', () => {
    for (const href of [
      'https://example.com/cfp',
      'http://example.com/cfp',
      '/tickets',
      'mailto:hi@example.com',
    ]) {
      const { container } = render(
        <PortableText
          value={linkBlock(href)}
          components={portableTextComponents}
        />,
      )
      expect(hrefs(container)).toEqual([href])
      cleanup()
    }
  })

  it('hardens the anchors it does render', () => {
    const { container } = render(
      <PortableText
        value={linkBlock('https://example.com/cfp')}
        components={portableTextComponents}
      />,
    )
    const anchor = container.querySelector('a')!
    expect(anchor.getAttribute('rel')).toBe('noopener noreferrer')
    expect(anchor.getAttribute('target')).toBe('_blank')
  })
})

/**
 * The rest of the map, so an upgrade that changes block/list/mark lookup is
 * caught as a rendering failure rather than as an unstyled page nobody views.
 */
describe('portableTextComponents renders the styled block set', () => {
  it('applies the house overrides for headings, lists and marks', () => {
    const { container } = render(
      <PortableText
        components={portableTextComponents}
        value={[
          {
            _type: 'block',
            _key: 'h',
            style: 'h2',
            markDefs: [],
            children: [
              { _type: 'span', _key: 's', text: 'Heading', marks: [] },
            ],
          },
          {
            _type: 'block',
            _key: 'q',
            style: 'blockquote',
            markDefs: [],
            children: [{ _type: 'span', _key: 's', text: 'Quoted', marks: [] }],
          },
          {
            _type: 'block',
            _key: 'li',
            style: 'normal',
            listItem: 'bullet',
            level: 1,
            markDefs: [],
            children: [{ _type: 'span', _key: 's', text: 'Item', marks: [] }],
          },
          {
            _type: 'block',
            _key: 'm',
            style: 'normal',
            markDefs: [],
            children: [
              { _type: 'span', _key: 'a', text: 'bold', marks: ['strong'] },
              { _type: 'span', _key: 'b', text: 'italic', marks: ['em'] },
              { _type: 'span', _key: 'c', text: 'code', marks: ['code'] },
            ],
          },
        ]}
      />,
    )

    // The house class is what distinguishes OUR override from the library
    // default, which emits the same tag with no className.
    expect(container.querySelector('h2')?.className).toContain('text-2xl')
    expect(container.querySelector('blockquote')?.className).toContain(
      'border-l-4',
    )
    expect(container.querySelector('ul')?.className).toContain('list-disc')
    expect(container.querySelector('li')?.className).toContain(
      'leading-relaxed',
    )
    expect(container.querySelector('strong')?.className).toContain(
      'font-semibold',
    )
    expect(container.querySelector('em')?.className).toContain('italic')
    expect(container.querySelector('code')?.className).toContain('font-mono')
  })
})
