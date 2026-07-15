import { serializeJsonLd } from '@/lib/seo/eventJsonLd'
import {
  buildPersonJsonLd,
  type BuildPersonJsonLdOptions,
} from '@/lib/seo/personJsonLd'

/**
 * Renders a schema.org `Person` JSON-LD `<script>` for a speaker.
 *
 * The object is built by {@link buildPersonJsonLd} (which omits every unknown
 * field) and serialized with {@link serializeJsonLd} so a value containing `<`
 * cannot break out of the script element.
 */
export function PersonJsonLd(props: BuildPersonJsonLdOptions) {
  const data = buildPersonJsonLd(props)

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
