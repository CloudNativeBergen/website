/**
 * Basic SVG sanitizer to strip out potentially malicious content.
 * Focuses on removing <script> tags and 'on*' event attributes.
 */
export function sanitizeSvg(svgContent: string): string {
  if (!svgContent) return svgContent

  let sanitized = svgContent

  // 1. Remove <script> tags and their content
  sanitized = sanitized.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    '',
  )

  // 2. Remove event handler attributes (on*)
  // This matches attributes like onclick, onload, onmouseover, etc.
  sanitized = sanitized.replace(
    /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi,
    '',
  )

  // 3. Remove javascript: pseudo-protocol in attributes
  sanitized = sanitized.replace(
    /href\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]*)/gi,
    'href="#"',
  )

  // 4. Remove <foreignObject> tags which can be used to embed HTML/XHTML
  sanitized = sanitized.replace(
    /<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi,
    '',
  )

  return sanitized
}
