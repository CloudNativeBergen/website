import 'server-only'
import type { StreamWall } from '@/components/stream/StreamWallRotation'
import type { Conference } from '@/lib/conference/types'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { photoWallLinks } from '@/lib/photo-wall/links'
import type { ScreenView } from '@/lib/photo-wall/screen'
import { readScreenPage } from '@/lib/photo-wall/screen-page'
import type { WallLook } from '@/lib/photo-wall/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'

/** Where a room screen starts when there is no wall to read. */
const NO_WALL: ScreenView = {
  closed: true,
  sponsorStrip: false,
  look: 'pinboard',
  posts: [],
}

/**
 * What a room screen needs to show the Photo Wall in turns, read like
 * `/wall/screen` reads it (the cached wall). A conference without a wall, or
 * a read that fails, starts the screen on a closed wall: the room view shows
 * alone, and the poll brings the wall in once it is made or read.
 */
export async function readStreamWall(
  conference: Conference,
  sponsors: ConferenceSponsor[],
  look: WallLook | undefined,
): Promise<StreamWall> {
  return {
    initial: await readInitial(conference._id),
    conference: {
      logo: pickConferenceLogoProps(conference),
      postUrl: photoWallLinks(conference).post,
      sponsors,
    },
    look,
  }
}

async function readInitial(conferenceId: string): Promise<ScreenView> {
  try {
    return (await readScreenPage(conferenceId)) ?? NO_WALL
  } catch (error) {
    console.error('Could not read the Photo Wall for the room screen', error)
    return NO_WALL
  }
}
