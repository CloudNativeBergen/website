import { serializeJsonLd } from '@/lib/seo/eventJsonLd'
import {
  buildBreadcrumbJsonLd,
  type BreadcrumbItem,
} from '@/lib/seo/breadcrumbJsonLd'

/**
 * Renders a schema.org `BreadcrumbList` JSON-LD `<script>` from an ordered
 * list of crumbs.
 *
 * The object is built by {@link buildBreadcrumbJsonLd} and serialized with
 * {@link serializeJsonLd} so a value containing `<` cannot break out of the
 * script element.
 */
export function BreadcrumbJsonLd({ items }: { items: BreadcrumbItem[] }) {
  const data = buildBreadcrumbJsonLd(items)

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
