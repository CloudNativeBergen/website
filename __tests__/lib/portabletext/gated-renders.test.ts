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

/**
 * The body of every `link:` mark defined in `source`.
 *
 * A render can pass `components=` and still be unsafe: an INLINE map may define
 * its own `link` mark that assigns the raw href. The Hero's announcement did
 * exactly that, and the presence-only check above accepted it — so this second
 * scan looks at what the mark DOES, not merely that a map was supplied.
 */
function linkMarkBodies(source: string): string[] {
  const bodies: string[] = []
  const opening = /\blink:\s*(\(|function)/g
  let match: RegExpExecArray | null

  while ((match = opening.exec(source)) !== null) {
    // `link` is an OBJECT PROPERTY, so its value ends at the comma that closes
    // it (at nesting depth 0) or when the enclosing object closes. Stopping at
    // the first balanced bracket instead would end at the parameter list —
    // `({ children, value })` — and never reach the body where the href is
    // assigned, which is exactly how the first version of this scan silently
    // matched nothing.
    let depth = 0
    let i = match.index + match[0].length - 1
    for (; i < source.length; i++) {
      const c = source[i]
      if (c === '(' || c === '{' || c === '[') depth++
      else if (c === ')' || c === '}' || c === ']') {
        if (depth === 0) break
        depth--
      } else if (c === ',' && depth === 0) break
    }
    bodies.push(source.slice(match.index, i))
  }
  return bodies
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

  it('routes every link mark through toSafeRichTextHref', () => {
    const raw: string[] = []
    let found = 0

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const body of linkMarkBodies(source)) {
        // Only marks that actually emit an href are in scope.
        if (!/href=\{/.test(body)) continue
        found++
        if (!/toSafeRichTextHref/.test(body)) {
          raw.push(file.replace(process.cwd() + '/', ''))
        }
      }
    }

    // Same anti-vacuity guard as above: a parser that stopped matching would
    // otherwise report a clean sweep over nothing.
    expect(found).toBeGreaterThanOrEqual(2)
    expect(raw).toEqual([])
  })
})
