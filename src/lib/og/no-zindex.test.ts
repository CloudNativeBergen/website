import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Satori ignores `zIndex` (it paints in DOM order) and logs a warning for
// every element that carries one, which flooded production logs.
const OG_SOURCES = [
  'src/lib/og/template.tsx',
  'src/lib/og/components.tsx',
  'src/app/(main)/speaker/[slug]/opengraph-image.tsx',
  'src/app/(public)/badge/[badgeId]/opengraph-image.tsx',
]

describe('OG image sources', () => {
  it.each(OG_SOURCES)('%s uses no zIndex', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(/zIndex/)
  })
})
