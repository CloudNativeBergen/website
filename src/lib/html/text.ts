/**
 * HTML → plain text, for showing a stored HTML string as escaped React text.
 * Dependency-free so client components and server pages can both import it.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole: string, entity: string) => {
      const lower = entity.toLowerCase()
      if (lower.startsWith('#')) {
        const code = lower.startsWith('#x')
          ? parseInt(lower.slice(2), 16)
          : Number(lower.slice(1))
        // Out of range (`&#1114112;`) or a surrogate is left as written
        // rather than thrown: a page's typo must not fail a publish.
        return Number.isInteger(code) &&
          code >= 0 &&
          code <= 0x10ffff &&
          (code < 0xd800 || code > 0xdfff)
          ? String.fromCodePoint(code)
          : whole
      }
      return ENTITIES[lower] ?? whole
    },
  )
}

/**
 * Strip tags, keeping line structure: `<br>` and block closers become line
 * breaks so paragraphs don't run together. Entities are decoded AFTER the
 * tags are gone, so `&lt;b&gt;` comes out as the literal text `<b>`. The
 * result is text for a React child (escaped there), never for innerHTML.
 */
export function stripHtml(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|ul|ol)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
  return decodeEntities(text)
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
