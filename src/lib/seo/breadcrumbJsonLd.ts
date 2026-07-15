/** A single breadcrumb entry: a human label and its absolute URL. */
export interface BreadcrumbItem {
  name: string
  /** Absolute URL for this crumb. */
  url: string
}

/**
 * Builds a schema.org `BreadcrumbList` JSON-LD object from an ordered list of
 * crumbs. Positions are 1-based and follow the input order; each crumb becomes
 * a `ListItem` with an absolute `item` URL.
 *
 * @see https://schema.org/BreadcrumbList
 */
export function buildBreadcrumbJsonLd(
  items: BreadcrumbItem[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}
