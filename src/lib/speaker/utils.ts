import { Speaker } from './types'

const FALLBACK_SLUG = 'unknown-speaker' as const

export function generateSlugFromName(name: string): string {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return ''
  }

  return name.trim().replace(/\s+/g, '-').toLowerCase()
}

export function getSpeakerSlug(
  speaker: Pick<Speaker, 'slug' | 'name'>,
): string {
  if (speaker.slug?.trim()) {
    return speaker.slug
  }

  return generateSlugFromName(speaker.name) || FALLBACK_SLUG
}

export function getSpeakerFilename(
  speaker: Pick<Speaker, 'slug' | 'name'>,
): string {
  return getSpeakerSlug(speaker)
}
