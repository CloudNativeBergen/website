/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { RichTextContent } from './RichTextContent'

/**
 * The OUT side of the two-sided contract, asserted against the real DOM.
 *
 * The write path is not the only writer — Sanity Studio and any dataset tooling
 * bypass it — so every payload here is fed straight to the renderer as if it had
 * been stored, with no validation in between. What must hold: nothing becomes an
 * element or an attribute we did not choose.
 */

afterEach(cleanup)

describe('RichTextContent renders hostile stored content inertly', () => {
  it('never produces a script, iframe, object or embed element', () => {
    const { container } = render(
      <RichTextContent
        content={[
          { _type: 'html', _key: 'x', html: '<script>alert(1)</script>' },
          { _type: 'iframe', _key: 'y', src: 'https://evil.example' },
          {
            _type: 'block',
            _key: 'b',
            markDefs: [],
            children: [
              {
                _type: 'span',
                _key: 's',
                text: '<script>alert(1)</script><img src=x onerror=alert(1)>',
                marks: [],
              },
            ],
          },
        ]}
      />,
    )
    expect(
      container.querySelector('script, iframe, object, embed, style, link'),
    ).toBeNull()
    // The payload is VISIBLE as text — proof it was escaped, not parsed.
    expect(container.textContent).toContain('<script>alert(1)</script>')
    expect(container.querySelector('img')).toBeNull()
  })

  it('degrades a javascript: link to an inert anchor', () => {
    const { container } = render(
      <RichTextContent
        content={[
          {
            _type: 'block',
            _key: 'b',
            markDefs: [
              { _type: 'link', _key: 'l', href: 'javascript:alert(1)' },
            ],
            children: [
              { _type: 'span', _key: 's', text: 'Tickets', marks: ['l'] },
            ],
          },
        ]}
      />,
    )
    // The mark is stripped before render, so there is no anchor at all — and if
    // a future change lets one through, the shared link mark still forces '#'.
    const anchor = container.querySelector('a')
    expect(anchor?.getAttribute('href') ?? '#').toBe('#')
    expect(container.textContent).toContain('Tickets')
  })

  it('renders a safe link with the house rel/target hardening', () => {
    const { container } = render(
      <RichTextContent
        content={[
          {
            _type: 'block',
            _key: 'b',
            markDefs: [
              { _type: 'link', _key: 'l', href: 'https://example.com/cfp' },
            ],
            children: [{ _type: 'span', _key: 's', text: 'CFP', marks: ['l'] }],
          },
        ]}
      />,
    )
    const anchor = container.querySelector('a')!
    expect(anchor.getAttribute('href')).toBe('https://example.com/cfp')
    expect(anchor.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('shows a code block as text and never loads a remote image', () => {
    const { container } = render(
      <RichTextContent
        content={[
          {
            _type: 'richTextCode',
            _key: 'c',
            language: 'yaml',
            code: 'kind: Venue\nname: </code><script>alert(1)</script>',
          },
          {
            _type: 'richTextImage',
            _key: 'i',
            asset: { _ref: 'https://evil.example/pixel.gif' },
            alt: 'x',
          },
        ]}
      />,
    )
    expect(container.querySelector('pre')?.textContent).toContain(
      '<script>alert(1)</script>',
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders nothing at all when the content is empty or junk', () => {
    for (const content of [null, undefined, [], 'nope', [{ _type: 'html' }]]) {
      const { container } = render(<RichTextContent content={content} />)
      expect(container.innerHTML).toBe('')
      cleanup()
    }
  })

  it('puts a table in its own scroll container so a wide one cannot push the page sideways', () => {
    const { container } = render(
      <RichTextContent
        content={[
          {
            _type: 'richTextTable',
            _key: 't',
            headerRow: true,
            rows: [
              { _key: 'r1', cells: ['Room', 'Track'] },
              { _key: 'r2', cells: ['Peer Gynt', 'Platform Engineering'] },
            ],
          },
        ]}
      />,
    )
    const table = container.querySelector('table')!
    expect(table.parentElement?.className).toContain('overflow-x-auto')
    expect(container.querySelectorAll('th')).toHaveLength(2)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
  })
})
