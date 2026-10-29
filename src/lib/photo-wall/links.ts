import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import type { PhotoWallLinks } from './types'

/** The wall's three public pages on the conference's own domain (§10). */
export function photoWallLinks(
  conference: Parameters<typeof conferenceBaseUrl>[0],
): PhotoWallLinks {
  const base = `${conferenceBaseUrl(conference)}/wall`
  return { post: `${base}/post`, wall: base, screen: `${base}/screen` }
}
