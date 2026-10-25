import 'server-only'
import type { StreamWall } from '@/components/stream/StreamWallRotation'
import type { Conference } from '@/lib/conference/types'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { photoWallLinks } from '@/lib/photo-wall/links'
import { readScreenPage } from '@/lib/photo-wall/screen-page'
import type { WallLook } from '@/lib/photo-wall/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'

/**
 * What a room screen needs to show the Photo Wall in turns, read like
 * `/wall/screen` reads it (the cached wall), or null when the conference has
 * no wall. A read that fails must not take the room screen down with it:
 * the room view then shows alone.
 */
export async function readStreamWall(
  conference: Conference,
  sponsors: ConferenceSponsor[],
  look: WallLook | undefined,
): Promise<StreamWall | null> {
  try {
    const initial = await readScreenPage(conference._id)
    if (!initial) return null
    return {
      initial,
      conference: {
        logo: pickConferenceLogoProps(conference),
        postUrl: photoWallLinks(conference).post,
        sponsors,
      },
      look,
    }
  } catch (error) {
    console.error('Could not read the Photo Wall for the room screen', error)
    return null
  }
}
