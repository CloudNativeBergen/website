/**
 * Raised in review on #727: the link mark interpolated `value.href` straight
 * into an `href="…"` attribute of a hand-built HTML string.
 *
 * Two holes, and the fix needs both. A stored `javascript:` href rode out in
 * mail a client may open in a browser context; and a value containing a quote
 * closed the attribute, so everything after it became markup nobody wrote.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'

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

describe('portable text links in email', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('refuses a javascript: href, degrading to #', () => {
    const html = portableTextToHTML(linkBlock('javascript:alert(1)'))
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="#"')
  })

  it('cannot break out of the attribute with a quote', () => {
    const html = portableTextToHTML(
      linkBlock('https://ok.example/" onmouseover="x'),
    )
    const anchor = html.match(/<a[^>]*>/)?.[0] ?? ''

    // NOTE on how this is asserted. A naive `not.toMatch(/onmouseover=/)` is
    // WRONG here and passed against the unescaped code: once the quote becomes
    // `&quot;` the text `onmouseover=` is still present, harmlessly, inside the
    // href value. What matters is that it is not a SEPARATE attribute — so
    // count the raw quotes instead. A correctly escaped anchor has exactly the
    // quotes that open and close href and style.
    expect(anchor).toContain('&quot;')
    expect((anchor.match(/"/g) ?? []).length).toBe(4)
  })

  it('keeps an ordinary link intact', () => {
    const html = portableTextToHTML(linkBlock('https://ok.example/talks'))
    expect(html).toContain('href="https://ok.example/talks"')
  })

  it('keeps mailto:, which the site allows in rich text', () => {
    const html = portableTextToHTML(linkBlock('mailto:hi@example.com'))
    expect(html).toContain('href="mailto:hi@example.com"')
  })
})
