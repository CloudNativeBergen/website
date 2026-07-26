/**
 * @vitest-environment node
 *
 * OB 3.0 PNG baking: an `openbadgecredential` iTXt chunk carrying the raw
 * credential, rasterized from the badge SVG. The credential bytes must survive
 * bake→extract untouched (a signed credential cannot tolerate mutation).
 */
import { describe, it, expect } from 'vitest'
import {
  OB_PNG_KEYWORD,
  bakeCredentialIntoPng,
  extractCredentialFromPng,
  renderBadgeSvgToPng,
} from '@/lib/badge/png'

// A real, multi-chunk PNG produced by the same rasterizer the route uses.
const TINY_PNG = renderBadgeSvgToPng(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#111"/></svg>',
  8,
)

const CREDENTIAL = JSON.stringify({
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  id: 'https://example.com/api/badge/abc',
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  proof: [{ type: 'DataIntegrityProof', proofValue: 'z3Abc]]>weird' }],
})

describe('PNG baking', () => {
  it('uses the spec keyword openbadgecredential', () => {
    expect(OB_PNG_KEYWORD).toBe('openbadgecredential')
  })

  it('round-trips the credential byte-for-byte through bake → extract', () => {
    const baked = bakeCredentialIntoPng(TINY_PNG, CREDENTIAL)
    expect(extractCredentialFromPng(baked)).toBe(CREDENTIAL)
  })

  it('keeps the PNG valid (signature + IEND preserved)', () => {
    const baked = bakeCredentialIntoPng(TINY_PNG, CREDENTIAL)
    expect(Array.from(baked.subarray(0, 8))).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ])
    const tail = Buffer.from(baked.subarray(baked.length - 8)).toString(
      'latin1',
    )
    expect(tail).toContain('IEND')
  })

  it('re-bakes idempotently (single credential chunk, not two)', () => {
    const once = bakeCredentialIntoPng(TINY_PNG, CREDENTIAL)
    const twice = bakeCredentialIntoPng(once, CREDENTIAL)
    expect(twice.length).toBe(once.length)
    expect(extractCredentialFromPng(twice)).toBe(CREDENTIAL)
  })

  it('returns null when no credential is baked in', () => {
    expect(extractCredentialFromPng(TINY_PNG)).toBeNull()
  })

  it('throws on non-PNG input', () => {
    expect(() =>
      bakeCredentialIntoPng(new Uint8Array([1, 2, 3]), CREDENTIAL),
    ).toThrow(/PNG/)
  })

  it('rasterizes a badge SVG (strips the credential node) then bakes', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:openbadges="https://purl.imsglobal.org/ob/v3p0" viewBox="0 0 100 100">' +
      '<openbadges:credential><![CDATA[ {"stale":true} ]]></openbadges:credential>' +
      '<rect width="100" height="100" fill="#3b82f6"/></svg>'
    const png = renderBadgeSvgToPng(svg, 256)
    // Valid PNG, and the drawable-only render carries no credential yet.
    expect(Array.from(png.subarray(0, 4))).toEqual([137, 80, 78, 71])
    expect(extractCredentialFromPng(png)).toBeNull()
    // Baking the real credential in makes it extractable.
    const baked = bakeCredentialIntoPng(png, CREDENTIAL)
    expect(extractCredentialFromPng(baked)).toBe(CREDENTIAL)
  })
})
