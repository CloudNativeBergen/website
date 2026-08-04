/**
 * EVERY `<PortableText>` render must pass the gated `components` map.
 *
 * The library's DEFAULT link mark emits `value.href` verbatim. Portable Text
 * here is author-supplied — speaker bios, talk abstracts, sponsor terms — so an
 * ungated render turns stored content into a live anchor with an attacker's
 * scheme. `portableTextComponents` exists precisely to stop that: its `link`
 * mark runs every href through `toSafeRichTextHref`.
 *
 * React is NOT a substitute for that gate. It scrubs a bare `javascript:` href,
 * but passes `data:`, `vbscript:`, protocol-relative `//evil.example` and
 * `https:evil.example` straight through.
 *
 * Two call sites were rendering ungated — a talk description and a proposal
 * abstract, both author-supplied — and nothing failed, because the omission is
 * invisible to type-checking and to every rendering test that does not happen to
 * contain a hostile href. This scans the source instead, so the next one fails
 * here rather than in production.
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const SRC = join(process.cwd(), 'src')

/** Every `.tsx` under `src/`. */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) tsxFiles(full, out)
    else if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * The attribute text of each `<PortableText …>` element in `source`.
 *
 * Scans to the element's own closing bracket while tracking brace depth, so an
 * attribute value containing `>` (`({ children }) => …`) does not end the match
 * early — a regex stopping at the first `>` would silently skip elements and
 * make this whole test pass vacuously.
 */
function portableTextElements(source: string): string[] {
  const elements: string[] = []
  // `\b` alone would also match PortableTextEditor / PortableTextBlock.
  const opening = /<PortableText(?![A-Za-z0-9_])/g
  let match: RegExpExecArray | null

  while ((match = opening.exec(source)) !== null) {
    let depth = 0
    let i = match.index + match[0].length
    for (; i < source.length; i++) {
      const c = source[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    elements.push(source.slice(match.index, i))
  }
  return elements
}

describe('every PortableText render is gated', () => {
  const files = tsxFiles(SRC)

  it('finds renders to check — the scan cannot pass vacuously', () => {
    const total = files
      .map((f) => portableTextElements(readFileSync(f, 'utf8')).length)
      .reduce((a, b) => a + b, 0)

    // Guards the parser itself: if `portableTextElements` silently stopped
    // matching, every assertion below would pass on an empty set.
    expect(total).toBeGreaterThanOrEqual(8)
  })

  it('passes a `components` map at every call site', () => {
    const ungated: string[] = []

    for (const file of files) {
      for (const element of portableTextElements(readFileSync(file, 'utf8'))) {
        if (!/\bcomponents=/.test(element)) {
          ungated.push(
            `${file.replace(process.cwd() + '/', '')}: ${element
              .replace(/\s+/g, ' ')
              .slice(0, 80)}`,
          )
        }
      }
    }

    expect(ungated).toEqual([])
  })
})
