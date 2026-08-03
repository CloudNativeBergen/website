import { describe, it, expect } from 'vitest'
import {
  APPEARANCE_PAGE,
  APPEARANCE_ROOT,
  APPEARANCE_SECTION,
  APPEARANCE_SECTIONS,
} from './appearance'

describe('appearance section IA', () => {
  it('defines the three in-page sections in page order', () => {
    expect(APPEARANCE_SECTIONS.map((s) => s.id)).toEqual([
      'theme',
      'logos',
      'homepage',
    ])
  })

  it('gives every section a title, nav label and description', () => {
    for (const s of APPEARANCE_SECTIONS) {
      expect(s.title.length).toBeGreaterThan(0)
      expect(s.navLabel.length).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(0)
    }
  })

  it('keeps every section on the one page, as a unique anchor', () => {
    const hrefs = APPEARANCE_SECTIONS.map((s) => s.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const s of APPEARANCE_SECTIONS) {
      // Anchors on the single page — no sub-pages. The old sub-page URLs
      // redirect here.
      expect(s.href).toBe(`${APPEARANCE_ROOT}#${s.id}`)
    }
  })

  it('describes the page itself', () => {
    expect(APPEARANCE_PAGE.href).toBe(APPEARANCE_ROOT)
    expect(APPEARANCE_PAGE.title.length).toBeGreaterThan(0)
    expect(APPEARANCE_PAGE.description.length).toBeGreaterThan(0)
  })

  it('exposes an id-keyed lookup covering every section', () => {
    for (const s of APPEARANCE_SECTIONS) {
      expect(APPEARANCE_SECTION[s.id]).toBe(s)
    }
    expect(Object.keys(APPEARANCE_SECTION)).toHaveLength(
      APPEARANCE_SECTIONS.length,
    )
  })
})
