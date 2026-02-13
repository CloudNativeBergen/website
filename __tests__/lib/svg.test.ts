import { describe, it, expect } from '@jest/globals'
import { sanitizeSvg } from '@/lib/svg'

describe('sanitizeSvg', () => {
  it('passes through a clean SVG unchanged', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="blue"/></svg>'
    expect(sanitizeSvg(svg)).toBe(svg)
  })

  it('returns falsy input as-is', () => {
    expect(sanitizeSvg('')).toBe('')
  })

  it('removes <script> tags and their content', () => {
    const svg =
      '<svg><script>alert("xss")</script><rect width="10" height="10"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('<script')
    expect(result).not.toContain('alert')
    expect(result).toContain('<rect')
  })

  it('removes script tags case-insensitively', () => {
    const svg =
      '<svg><SCRIPT>alert("xss")</SCRIPT><rect width="10" height="10"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('SCRIPT')
    expect(result).not.toContain('alert')
  })

  it('removes inline event handler attributes', () => {
    const svg = '<svg><rect onclick="alert(1)" width="10" height="10"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('alert')
    expect(result).toContain('width="10"')
  })

  it('removes onload event handlers', () => {
    const svg = '<svg onload="malicious()"><rect width="10" height="10"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('onload')
    expect(result).not.toContain('malicious')
  })

  it('removes onmouseover event handlers', () => {
    const svg =
      '<svg><rect onmouseover="steal()" width="10" height="10"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('onmouseover')
  })

  it('replaces javascript: URLs with safe href', () => {
    const svg =
      '<svg><a href="javascript:alert(1)"><text>Click me</text></a></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('javascript:')
    expect(result).toContain('href="#"')
  })

  it('handles javascript: URLs with single quotes', () => {
    const svg =
      "<svg><a href='javascript:alert(1)'><text>Click</text></a></svg>"
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('javascript:')
  })

  it('removes <foreignObject> tags and their content', () => {
    const svg =
      '<svg><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><div>HTML content</div></body></foreignObject><rect width="10" height="10"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('foreignObject')
    expect(result).not.toContain('HTML content')
    expect(result).toContain('<rect')
  })

  it('handles multiple attack vectors in a single SVG', () => {
    const svg =
      '<svg onload="bad()"><script>alert(1)</script><a href="javascript:void(0)"><text>link</text></a><foreignObject><div>html</div></foreignObject><rect width="10" height="10"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('script')
    expect(result).not.toContain('onload')
    expect(result).not.toContain('javascript:')
    expect(result).not.toContain('foreignObject')
    expect(result).toContain('<rect')
  })

  it('removes xlink:href with javascript: protocol', () => {
    const svg =
      '<svg><a xlink:href="javascript:alert(1)"><text>Click</text></a></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('javascript:')
    expect(result).toContain('href="#"')
  })

  it('removes href with data: protocol', () => {
    const svg =
      '<svg><a href="data:text/html,<script>alert(1)</script>"><text>link</text></a></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('data:')
  })

  it('removes xlink:href with data: protocol', () => {
    const svg =
      '<svg><use xlink:href="data:image/svg+xml,<svg onload=alert(1)>"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('data:')
  })

  it('removes iframe, embed, and object tags', () => {
    const svg =
      '<svg><iframe src="evil.html"></iframe><embed src="evil.swf"/><object data="evil.html"></object><rect width="10" height="10"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('iframe')
    expect(result).not.toContain('embed')
    expect(result).not.toContain('object')
    expect(result).toContain('<rect')
  })

  it('removes style attributes containing url()', () => {
    const svg =
      '<svg><rect style="background:url(javascript:alert(1))" width="10" height="10"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('url(')
    expect(result).toContain('width="10"')
  })

  it('preserves safe style attributes without url()', () => {
    const svg =
      '<svg><rect style="fill: red; stroke: blue" width="10" height="10"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).toContain('style="fill: red; stroke: blue"')
  })

  it('removes <use> elements with external references', () => {
    const svg =
      '<svg><use href="https://evil.com/sprite.svg#icon"/><rect width="10" height="10"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toContain('evil.com')
    expect(result).toContain('<rect')
  })

  it('preserves <use> elements with internal fragment references', () => {
    const svg = '<svg><defs><circle id="c" r="5"/></defs><use href="#c"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).toContain('href="#c"')
  })

  it('preserves SVG attributes like viewBox and xmlns', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none"><path d="M10 10" stroke="black"/></svg>'
    expect(sanitizeSvg(svg)).toBe(svg)
  })

  it('preserves complex SVG with gradients and transforms', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0%" stop-color="red"/></linearGradient></defs><rect transform="rotate(45)" fill="url(#g)" width="50" height="50"/></svg>'
    expect(sanitizeSvg(svg)).toBe(svg)
  })
})
