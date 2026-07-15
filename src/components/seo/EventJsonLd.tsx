import {
  buildEventJsonLd,
  serializeJsonLd,
  type BuildEventJsonLdOptions,
} from '@/lib/seo/eventJsonLd'

/**
 * Renders a schema.org `Event` JSON-LD `<script>` for the given conference.
 *
 * The object is built by {@link buildEventJsonLd} (which omits every unknown
 * field) and serialized with {@link serializeJsonLd} so a value containing
 * `<` cannot break out of the script element.
 */
export function EventJsonLd(props: BuildEventJsonLdOptions) {
  const data = buildEventJsonLd(props)

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
