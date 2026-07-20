/**
 * Authoritative, server-side SVG upload sanitizer.
 *
 * WHY A SECOND SANITIZER: `./render`'s `sanitizeSvg` is a client-safe regex pass
 * used for previews and defence-in-depth at render time. It must never be the
 * only gate on WRITE — regexes cannot reliably reason over the full XML grammar
 * (comments, CDATA, namespaces, attribute quoting, entity tricks). This module
 * is the gate on persist: it parses a REAL XML DOM with `@xmldom/xmldom`
 * (pure-JS, no jsdom — the app deliberately dropped jsdom, see `InlineSvg.tsx`)
 * and walks it against a strict allowlist.
 *
 * POLICY (documented, and asserted by tests):
 *   - Input over {@link MAX_SVG_BYTES} is REJECTED (`ok: false`) — never stored.
 *   - Markup whose root element is not `<svg>` is REJECTED.
 *   - Malformed XML is REJECTED.
 *   - A DOCTYPE / entity declaration (XXE / billion-laughs vector) is REJECTED.
 *   - Disallowed elements (`<script>`, `<foreignObject>`, `<style>`, `<image>`,
 *     …), event-handler attributes (`on*`), non-fragment `href`/`xlink:href`,
 *     `javascript:` URLs and `url()`/`@import` in inline styles are STRIPPED —
 *     the sanitized remainder is ACCEPTED, and each removal is surfaced as a
 *     warn-level note in `removed` so the organizer sees exactly what changed.
 *     Stripping is not a rejection: a logo with one stray handler still uploads,
 *     minus the handler.
 *   - Empty / whitespace-only / null input is treated as an UNSET
 *     (`ok: true, svg: null`) so the same helper clears a slot.
 *
 * BYTE-STABILITY: when nothing is stripped the ORIGINAL (trimmed) markup is
 * returned verbatim — a benign SVG round-trips byte-for-byte and re-sanitizing
 * is idempotent. Only when content is removed do we return the re-serialized
 * DOM.
 */
import { DOMParser, XMLSerializer, Node } from '@xmldom/xmldom'
import type { Element } from '@xmldom/xmldom'

/** Hard cap on accepted SVG markup (bytes, UTF-8). ~200 KB. */
export const MAX_SVG_BYTES = 200 * 1024

/**
 * Allowlisted element names, compared case-insensitively (SVG tag names are
 * case-sensitive, so a `<Script>` / `<foreignObject>` casing trick simply falls
 * outside the set and is stripped). Covers structure, shapes, text, gradients,
 * clipping/masking and the full filter-primitive family. Deliberately EXCLUDES
 * `script`, `foreignObject`, `style`, `image`, `audio`, `video`, `iframe`,
 * `embed`, `object`, `handler`, `set`, `animate*` (animation + external refs).
 */
const ALLOWED_ELEMENTS = new Set(
  [
    'svg',
    'g',
    'defs',
    'symbol',
    'use',
    'switch',
    'a',
    'title',
    'desc',
    'metadata',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'text',
    'tspan',
    'textPath',
    'tref',
    'linearGradient',
    'radialGradient',
    'stop',
    'clipPath',
    'mask',
    'pattern',
    'marker',
    'filter',
    'feBlend',
    'feColorMatrix',
    'feComponentTransfer',
    'feComposite',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feDropShadow',
    'feFlood',
    'feFuncA',
    'feFuncB',
    'feFuncG',
    'feFuncR',
    'feGaussianBlur',
    'feImage',
    'feMerge',
    'feMergeNode',
    'feMorphology',
    'feOffset',
    'feSpecularLighting',
    'feTile',
    'feTurbulence',
    'feDistantLight',
    'fePointLight',
    'feSpotLight',
  ].map((n) => n.toLowerCase()),
)

/** Matches a `url(...)`, `@import`, `expression(...)` or `javascript:` in CSS. */
const DANGEROUS_STYLE_RE = /url\s*\(|@import|expression\s*\(|javascript:/i
/** Matches an active-content URL scheme anywhere in an attribute value. */
const DANGEROUS_URL_RE = /javascript:|data:text\/html|vbscript:/i

export interface SanitizeSvgResult {
  /**
   * `true` when the value is safe to store (either sanitized markup or a
   * deliberate unset). `false` means REJECTED — nothing should be stored and
   * `error` explains why.
   */
  ok: boolean
  /** Sanitized markup, or `null` for an unset. `null` when `ok` is `false`. */
  svg: string | null
  /** Human-readable, deduped notes of what was stripped (empty when clean). */
  removed: string[]
  /** UTF-8 byte length of the input that was assessed. */
  sizeBytes: number
  /** Rejection reason when `ok` is `false`. */
  error?: string
}

/** Error thrown by {@link sanitizeSvgFieldOrThrow} on a hard rejection. */
export class SvgSanitizeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SvgSanitizeError'
  }
}

function reject(error: string, sizeBytes: number): SanitizeSvgResult {
  return { ok: false, svg: null, removed: [], sizeBytes, error }
}

/**
 * Sanitize a single SVG string. Pure and side-effect-free — safe to call from a
 * dry-run preview query or a write mutation. See the module policy above.
 */
export function sanitizeSvgUpload(
  input: string | null | undefined,
): SanitizeSvgResult {
  if (input == null || input.trim() === '') {
    return { ok: true, svg: null, removed: [], sizeBytes: 0 }
  }

  const sizeBytes = Buffer.byteLength(input, 'utf8')
  if (sizeBytes > MAX_SVG_BYTES) {
    return reject(
      `SVG is too large (${Math.ceil(sizeBytes / 1024)} KB). The maximum is ${Math.floor(
        MAX_SVG_BYTES / 1024,
      )} KB.`,
      sizeBytes,
    )
  }

  const trimmed = input.trim()

  // Reject DOCTYPE / entity declarations outright (XXE + billion-laughs). A
  // legitimate logo never needs one; entity expansion is a parser-level DoS/
  // exfiltration vector we refuse rather than try to neutralise.
  if (/<!DOCTYPE/i.test(trimmed) || /<!ENTITY/i.test(trimmed)) {
    return reject(
      'SVG contains a DOCTYPE or entity declaration, which is not allowed.',
      sizeBytes,
    )
  }

  let doc
  try {
    doc = new DOMParser({
      onError: (level, error) => {
        if (level === 'fatalError' || level === 'error') {
          const cause: unknown = error
          throw cause instanceof Error ? cause : new Error(String(cause))
        }
      },
    }).parseFromString(trimmed, 'image/svg+xml')
  } catch {
    return reject('SVG markup could not be parsed as valid XML.', sizeBytes)
  }

  const root = doc.documentElement
  if (!root || (root.localName || root.nodeName).toLowerCase() !== 'svg') {
    return reject('The root element must be <svg>.', sizeBytes)
  }

  const removed = new Set<string>()
  // Clean the ROOT <svg>'s own attributes first — cleanElement only visits a
  // node's CHILDREN, so without this an `onload` / dangerous `style` /
  // `javascript:` xlink:href placed directly on <svg …> would persist through
  // the authoritative write gate (a stored-XSS bypass) and the preview would
  // falsely report nothing removed.
  cleanAttributes(root, removed)
  cleanElement(root, removed)

  if (removed.size === 0) {
    // Nothing stripped → the original is safe by construction; return it
    // verbatim so benign uploads are byte-stable and idempotent.
    return { ok: true, svg: trimmed, removed: [], sizeBytes }
  }

  const serialized = new XMLSerializer().serializeToString(doc).trim()
  return {
    ok: true,
    svg: serialized,
    removed: [...removed].sort(),
    sizeBytes,
  }
}

/**
 * Recursively strip a node's disallowed children and attributes in place.
 * Collects human-readable removal notes into `removed`.
 */
function cleanElement(element: Node, removed: Set<string>): void {
  // Snapshot children first: we mutate the live child list as we go.
  const children = Array.from(element.childNodes)
  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      // Match on localName so a namespace-prefixed but legitimate SVG element
      // (`<svg:rect>`) is kept, while `<x:script>` is still caught by its local
      // name. Fall back to nodeName if localName is unavailable.
      const el = child as Element
      const local = (el.localName || child.nodeName).toLowerCase()
      if (!ALLOWED_ELEMENTS.has(local)) {
        removed.add(`<${child.nodeName}> element`)
        element.removeChild(child)
        continue
      }
      cleanAttributes(child as Element, removed)
      cleanElement(child, removed)
    } else if (child.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
      // Processing instructions (e.g. <?xml-stylesheet?>) can pull in external
      // CSS — drop them all.
      removed.add('processing instruction')
      element.removeChild(child)
    }
    // Text, CDATA and comment nodes are inert and kept as-is.
  }
}

/** Remove disallowed attributes from an element in place. */
function cleanAttributes(element: Element, removed: Set<string>): void {
  const attrs = element.attributes
  if (!attrs) return
  // Iterate over a snapshot of names — removeAttribute mutates the map.
  const names: string[] = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs.item(i)
    if (attr) names.push(attr.name)
  }

  for (const name of names) {
    const lower = name.toLowerCase()
    const value = element.getAttribute(name) ?? ''

    // Event handlers (onclick, onload, …).
    if (lower.startsWith('on')) {
      removed.add(`${lower} event handler`)
      element.removeAttribute(name)
      continue
    }

    // href / xlink:href: only same-document fragments (#id) survive.
    if (lower === 'href' || lower.endsWith(':href')) {
      if (!value.trim().startsWith('#')) {
        removed.add('external reference (href)')
        element.removeAttribute(name)
      }
      continue
    }

    // Inline styles that can reach out (url(), @import) or execute.
    if (lower === 'style') {
      if (DANGEROUS_STYLE_RE.test(value)) {
        removed.add('unsafe inline style')
        element.removeAttribute(name)
      }
      continue
    }

    // Any remaining attribute whose value carries an active-content scheme.
    if (DANGEROUS_URL_RE.test(value)) {
      removed.add(`unsafe value on ${lower}`)
      element.removeAttribute(name)
    }
  }
}

/**
 * Sanitize a logo field for persistence, THROWING {@link SvgSanitizeError} on a
 * hard rejection (oversize / non-SVG / malformed / entity). Returns the
 * sanitized markup, or `null` for an unset. Silent-strips disallowed content
 * per policy — callers that need to surface what changed should call
 * {@link sanitizeSvgUpload} directly.
 */
export function sanitizeSvgFieldOrThrow(
  value: string | null | undefined,
): string | null {
  const result = sanitizeSvgUpload(value)
  if (!result.ok) {
    throw new SvgSanitizeError(result.error ?? 'Invalid SVG.')
  }
  return result.svg
}
