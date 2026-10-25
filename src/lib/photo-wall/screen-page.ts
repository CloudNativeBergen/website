import 'server-only'
import { getWall } from './cache'
import { SCREEN_WHOLE_PX, type ScreenView } from './screen'
import { publicPost } from './wall-page'

/**
 * Screen Mode's view of the conference's cached wall (Photo Wall spec §8,
 * §9.2), or null when it has no wall: what `/wall/screen` renders first and
 * `photoWallPublic.screen` answers every 5 s. The same square URL as the Wall
 * page, so Sanity cuts each photo once for both. A closed wall shows nothing
 * but that it closed (§9.2).
 */
export async function readScreenPage(
  conferenceId: string,
): Promise<ScreenView | null> {
  const data = await getWall(conferenceId)
  if (!data) return null
  const { wall, posts } = data
  const closed = wall.closedAt !== null
  return {
    closed,
    sponsorStrip: wall.sponsorStrip,
    look: wall.look,
    posts: closed ? [] : posts.map((post) => publicPost(post, SCREEN_WHOLE_PX)),
  }
}
