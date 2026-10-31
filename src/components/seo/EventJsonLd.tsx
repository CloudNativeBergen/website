import {
  buildEventJsonLd,
  buildOrganizationJsonLd,
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

/** Renders the hub's top-level schema.org `Organization` JSON-LD (#398). */
export function OrganizationJsonLd(
  props: Pick<BuildEventJsonLdOptions, 'conference' | 'domain'>,
) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: serializeJsonLd(buildOrganizationJsonLd(props)),
      }}
    />
  )
}
