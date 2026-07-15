import type { Speaker } from '@/lib/speaker/types'

/** The speaker fields the Person builder actually depends on. */
export type PersonSpeaker = Pick<Speaker, 'name' | 'title' | 'image' | 'links'>

export interface BuildPersonJsonLdOptions {
  speaker: PersonSpeaker
  /** Absolute canonical URL of the speaker's profile page. */
  url?: string
  /**
   * Pre-resolved absolute image URL, when known. Preferred over the raw
   * `speaker.image` (which may be a Sanity asset reference) so the emitted
   * `image` is always a usable absolute URL.
   */
  image?: string
}

/**
 * Builds a schema.org `Person` JSON-LD object from a speaker.
 *
 * Every optional field is guarded: unknown fields are omitted rather than
 * emitted as `undefined` or empty, so the result always validates (passes
 * Google's Rich Results Test).
 *
 * @see https://schema.org/Person
 */
export function buildPersonJsonLd({
  speaker,
  url,
  image,
}: BuildPersonJsonLdOptions): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: speaker.name,
  }

  if (speaker.title) {
    jsonLd.jobTitle = speaker.title
  }

  const resolvedImage = image ?? speaker.image
  if (resolvedImage && typeof resolvedImage === 'string') {
    jsonLd.image = resolvedImage
  }

  if (url) {
    jsonLd.url = url
  }

  // `sameAs` links the person to their authoritative social/web profiles.
  if (speaker.links && speaker.links.length > 0) {
    jsonLd.sameAs = speaker.links
  }

  return jsonLd
}
