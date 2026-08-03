import { describe, it, expect } from 'vitest'
import {
  APPEARANCE_ROOT,
  APPEARANCE_SECTION,
  APPEARANCE_SECTIONS,
} from './appearance'

describe('appearance section IA', () => {
  it('defines the hub plus its three sub-sections in nav order', () => {
    expect(APPEARANCE_SECTIONS.map((s) => s.id)).toEqual([
      'overview',
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

  it('roots every href under the settings section and keeps them unique', () => {
    const hrefs = APPEARANCE_SECTIONS.map((s) => s.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const href of hrefs) {
      expect(href.startsWith(APPEARANCE_ROOT)).toBe(true)
      // Sub-pages, not anchors — the whole point of the section split.
      expect(href).not.toContain('#')
    }
  })

  it('derives sub-page paths 1:1 from the section ids', () => {
    for (const s of APPEARANCE_SECTIONS) {
      expect(s.href).toBe(
        s.id === 'overview' ? APPEARANCE_ROOT : `${APPEARANCE_ROOT}/${s.id}`,
      )
    }
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
