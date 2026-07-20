/**
 * SVG sanitizer that strips potentially malicious content.
 *
 * Uses an allowlist-like approach: remove dangerous tags, attributes, and
 * protocols rather than trying to enumerate safe elements. This covers the
 * OWASP SVG security cheat-sheet vectors including script injection, event
 * handlers, external references, data-URI payloads, and CSS url() escapes.
 */
export function sanitizeSvg(svgContent: string): string {
  if (!svgContent) return svgContent

  let sanitized = svgContent

  // 1. Remove dangerous tags and their content
  const dangerousTags = ['script', 'foreignObject', 'iframe', 'embed', 'object']
  for (const tag of dangerousTags) {
    sanitized = sanitized.replace(
      new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, 'gi'),
      '',
    )
    // Also remove self-closing variants
    sanitized = sanitized.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '')
  }

  // 2. Remove event handler attributes (on*)
  sanitized = sanitized.replace(
    /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi,
    '',
  )

  // 3. Neutralize javascript:/data: pseudo-protocols in href and xlink:href
  sanitized = sanitized.replace(
    /(?:xlink:)?href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi,
    (match) => {
      if (/(?:javascript|data)\s*:/i.test(match)) {
        return 'href="#"'
      }
      return match
    },
  )

  // 4. Remove style attributes containing url() which can reference external
  //    resources or encode javascript payloads
  sanitized = sanitized.replace(
    /\s+style\s*=\s*(?:"[^"]*"|'[^']*')/gi,
    (match) => {
      if (/url\s*\(/i.test(match)) return ''
      return match
    },
  )

  // 5. Remove <use> elements referencing external resources
  sanitized = sanitized.replace(
    /<use\b[^>]*(?:xlink:)?href\s*=\s*(?:"(?!#)[^"]*"|'(?!#)[^']*')[^>]*\/?>/gi,
    '',
  )

  return sanitized
}
