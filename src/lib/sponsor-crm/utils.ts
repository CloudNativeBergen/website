/**
 * Converts a sponsor name into a URL/filename-safe slug.
 * e.g. "Acme Corp AS" → "acme-corp-as"
 */
export function sanitizeSponsorName(name?: string): string {
  return (name || 'sponsor')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
