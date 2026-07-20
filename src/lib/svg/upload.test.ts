import { describe, it, expect } from 'vitest'
import {
  sanitizeSvgUpload,
  sanitizeSvgFieldOrThrow,
  SvgSanitizeError,
  MAX_SVG_BYTES,
} from './upload'

const BENIGN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z" fill="#1e40af"/></svg>`

describe('sanitizeSvgUpload', () => {
  describe('acceptance & byte-stability', () => {
    it('returns benign SVG byte-for-byte with nothing removed', () => {
      const r = sanitizeSvgUpload(BENIGN)
      expect(r.ok).toBe(true)
      expect(r.svg).toBe(BENIGN)
      expect(r.removed).toEqual([])
    })

    it('trims surrounding whitespace but is otherwise verbatim', () => {
      const r = sanitizeSvgUpload(`\n  ${BENIGN}\n`)
      expect(r.svg).toBe(BENIGN)
    })

    it('is idempotent — sanitizing the output again is stable', () => {
      const once = sanitizeSvgUpload(
        `<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()" width="10"/></svg>`,
      )
      const twice = sanitizeSvgUpload(once.svg)
      expect(twice.svg).toBe(once.svg)
      expect(twice.removed).toEqual([])
    })

    it('keeps inert comments and gradients', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"><!-- brand --><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect fill="url(#g)"/></svg>`
      const r = sanitizeSvgUpload(svg)
      expect(r.ok).toBe(true)
      expect(r.removed).toEqual([])
      expect(r.svg).toBe(svg)
    })
  })

  describe('unset semantics', () => {
    it.each([null, undefined, '', '   '])('treats %p as an unset', (input) => {
      const r = sanitizeSvgUpload(input)
      expect(r.ok).toBe(true)
      expect(r.svg).toBeNull()
      expect(r.removed).toEqual([])
    })
  })

  describe('hard rejections', () => {
    it('rejects markup over the size cap', () => {
      const filler = 'a'.repeat(MAX_SVG_BYTES + 1)
      const big = `<svg xmlns="http://www.w3.org/2000/svg"><desc>${filler}</desc></svg>`
      const r = sanitizeSvgUpload(big)
      expect(r.ok).toBe(false)
      expect(r.svg).toBeNull()
      expect(r.error).toMatch(/too large/i)
    })

    it('rejects a non-svg root element', () => {
      const r = sanitizeSvgUpload('<html><body>nope</body></html>')
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/root element must be <svg>/i)
    })

    it('rejects plain text / non-XML', () => {
      const r = sanitizeSvgUpload('just a string')
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/could not be parsed/i)
    })

    it('rejects malformed XML', () => {
      const r = sanitizeSvgUpload('<svg><rect></svg>')
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/could not be parsed/i)
    })

    it('rejects a DOCTYPE / entity declaration (XXE / billion-laughs)', () => {
      const r = sanitizeSvgUpload(
        `<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>`,
      )
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/doctype or entity/i)
    })
  })

  describe('stripping (accepted, with warnings)', () => {
    it('strips <script> elements', () => {
      const r = sanitizeSvgUpload(
        `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10"/></svg>`,
      )
      expect(r.ok).toBe(true)
      expect(r.svg).not.toMatch(/script/i)
      expect(r.svg).toMatch(/<rect/)
      expect(r.removed).toContain('<script> element')
    })

    it('strips <foreignObject> (HTML injection vector)', () => {
      const r = sanitizeSvgUpload(
        `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml">x</body></foreignObject></svg>`,
      )
      expect(r.ok).toBe(true)
      expect(r.svg).not.toMatch(/foreignObject/i)
      expect(r.removed.some((m) => /foreignObject/i.test(m))).toBe(true)
    })

    it('strips event-handler attributes', () => {
      const r = sanitizeSvgUpload(
        `<svg xmlns="http://www.w3.org/2000/svg"><rect onload="steal()" onclick="x()" width="10"/></svg>`,
      )
      expect(r.svg).not.toMatch(/onload|onclick/i)
      expect(r.svg).toMatch(/width="10"/)
      expect(r.removed).toContain('onload event handler')
      expect(r.removed).toContain('onclick event handler')
    })

    it('strips javascript: hrefs but keeps fragment references', () => {
      const r = sanitizeSvgUpload(
        `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><use href="#icon"/></a></svg>`,
      )
      expect(r.svg).not.toMatch(/javascript:/i)
      expect(r.svg).toMatch(/#icon/)
      expect(r.removed).toContain('external reference (href)')
    })

    it('strips external xlink:href on <use> but keeps internal ones', () => {
      const external = sanitizeSvgUpload(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://evil.example/x.svg#a"/></svg>`,
      )
      expect(external.svg).not.toMatch(/evil\.example/)
      expect(external.removed).toContain('external reference (href)')

      const internal = sanitizeSvgUpload(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a"/></svg>`,
      )
      expect(internal.svg).toMatch(/#a/)
      expect(internal.removed).toEqual([])
    })

    it('strips inline styles that pull external resources', () => {
      const r = sanitizeSvgUpload(
        `<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://evil.example/x)" width="10"/></svg>`,
      )
      expect(r.svg).not.toMatch(/evil\.example/)
      expect(r.removed).toContain('unsafe inline style')
    })

    it('strips processing instructions (external stylesheet)', () => {
      const r = sanitizeSvgUpload(
        `<svg xmlns="http://www.w3.org/2000/svg"><?xml-stylesheet href="x.css"?><rect width="10"/></svg>`,
      )
      expect(r.svg).not.toMatch(/xml-stylesheet/)
      expect(r.removed).toContain('processing instruction')
    })

    it('strips <image> and <style> elements', () => {
      const r = sanitizeSvgUpload(
        `<svg xmlns="http://www.w3.org/2000/svg"><style>* { background: url(x) }</style><image href="data:text/html,x"/><rect width="10"/></svg>`,
      )
      expect(r.ok).toBe(true)
      expect(r.svg).toMatch(/<rect/)
      expect(r.removed).toContain('<style> element')
      expect(r.removed).toContain('<image> element')
    })

    it('strips an event handler on the ROOT <svg> element', () => {
      const r = sanitizeSvgUpload(
        `<svg xmlns="http://www.w3.org/2000/svg" onload="steal()"><rect width="10"/></svg>`,
      )
      expect(r.ok).toBe(true)
      expect(r.svg).not.toMatch(/onload/i)
      expect(r.removed).toContain('onload event handler')
    })

    it('strips a dangerous inline style on the ROOT <svg> element', () => {
      const r = sanitizeSvgUpload(
        `<svg xmlns="http://www.w3.org/2000/svg" style="background:url(https://evil.example/x)"><rect width="10"/></svg>`,
      )
      expect(r.svg).not.toMatch(/evil\.example/)
      expect(r.removed).toContain('unsafe inline style')
    })
  })
})

describe('sanitizeSvgFieldOrThrow', () => {
  it('returns sanitized markup for accepted input', () => {
    expect(sanitizeSvgFieldOrThrow(BENIGN)).toBe(BENIGN)
  })

  it('returns null for an unset', () => {
    expect(sanitizeSvgFieldOrThrow(null)).toBeNull()
    expect(sanitizeSvgFieldOrThrow('')).toBeNull()
  })

  it('throws SvgSanitizeError on a hard rejection', () => {
    expect(() => sanitizeSvgFieldOrThrow('<html></html>')).toThrow(
      SvgSanitizeError,
    )
  })
})
