/**
 * Build a Google Maps "search" directions link from the venue name/address. The
 * URL is CONSTRUCTED from the conference fields at render — no tenant-entered URL
 * is stored, and there are no map tiles/embeds (CSP + privacy, closed-registry
 * rule). Returns `null` when there is nothing to search for.
 */
export function buildDirectionsUrl(
  name?: string,
  address?: string,
): string | null {
  const query = [name, address]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ')
  if (!query) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
