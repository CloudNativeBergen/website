import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { WALL_POST_LIMIT, type WallPost } from './wall'

/**
 * The wall's posts (Photo Wall spec §8) on the NON-CDN client, so the cached
 * {@link getWall} in `./cache` refills with what an approval just wrote,
 * never a CDN answer that lags it.
 */

interface WallPostRow {
  _id: string
  photo: {
    url: string | null
    width: number | null
    height: number | null
  } | null
  crop: { x: number | null; y: number | null } | null
  caption: string | null
  name: string | null
  approvedAt: string | null
}

/**
 * The newest {@link WALL_POST_LIMIT} approvals of the conference, newest
 * first; with `talkId`, only those tagged with that talk, and none while any
 * of its speakers opted out (Talk photos spec §7.4, §8). An absent
 * `talkPhotosOptOut` reads as not opted out.
 */
export async function readWallPosts(
  conferenceId: string,
  talkId?: string,
): Promise<WallPost[]> {
  const talk = talkId
    ? ` && talk._ref == $talkId && count(talk->speakers[@->talkPhotosOptOut == true]) == 0`
    : ''
  const rows = await scopedFetch<WallPostRow[]>(
    clientReadUncached,
    { conferenceId },
    // The projection names what the public gets: never `deviceKey`,
    // `marketingConsent` or the submission time. A post without a photo
    // can't be shown, so it doesn't take one of the 200. Published only.
    `*[_type == "wallPost" && status == "approved" && defined(photo.asset) && !(_id in path("drafts.**"))${talk}]
      | order(approvedAt desc, _id asc) [0...${WALL_POST_LIMIT}] {
      _id,
      "photo": photo.asset->{
        url,
        "width": metadata.dimensions.width,
        "height": metadata.dimensions.height
      },
      crop{ x, y },
      caption,
      name,
      approvedAt
    }`,
    talkId ? { talkId } : {},
  )
  return toWallPosts(rows)
}

function toWallPosts(rows: WallPostRow[]): WallPost[] {
  const posts: WallPost[] = []
  for (const row of rows) {
    const { photo } = row
    if (!photo?.url || !photo.width || !photo.height || !row.approvedAt) {
      console.warn(`Wall Post ${row._id} is approved but can't be shown`)
      continue
    }
    posts.push({
      _id: row._id,
      photo: { url: photo.url, width: photo.width, height: photo.height },
      // A missing crop is centred, as on the admin card.
      crop: { x: row.crop?.x ?? 0.5, y: row.crop?.y ?? 0.5 },
      caption: row.caption ?? null,
      name: row.name ?? null,
      approvedAt: row.approvedAt,
    })
  }
  return posts
}

/** One of {@link readSpeakerTalkPosts}'s talks, its posts newest first. */
export interface SpeakerTalkPosts {
  talkId: string
  title: string
  hidden: boolean
  posts: WallPost[]
}

/**
 * The approved posts tagged with the talks `speakerId` speaks at in this
 * conference, for their dashboard (Talk photos spec §7.3). It SKIPS the
 * opt-out condition and answers `hidden` instead, so the speaker sees what
 * the opt-out keeps off the public pages. Never another speaker's talk: the
 * filter itself requires `speakerId` among the talk's speakers. Uncached;
 * the dashboard is per user.
 */
export async function readSpeakerTalkPosts(
  conferenceId: string,
  speakerId: string,
): Promise<SpeakerTalkPosts[]> {
  const rows = await scopedFetch<
    (WallPostRow & { talkId: string; title: string | null; hidden: boolean })[]
  >(
    clientReadUncached,
    { conferenceId },
    `*[_type == "wallPost" && status == "approved" && defined(photo.asset) && !(_id in path("drafts.**")) && $speakerId in talk->speakers[]._ref]
      | order(approvedAt desc, _id asc) [0...${WALL_POST_LIMIT}] {
      _id,
      "photo": photo.asset->{
        url,
        "width": metadata.dimensions.width,
        "height": metadata.dimensions.height
      },
      crop{ x, y },
      caption,
      name,
      approvedAt,
      "talkId": talk._ref,
      "title": talk->title,
      "hidden": count(talk->speakers[@->talkPhotosOptOut == true]) > 0
    }`,
    { speakerId },
  )
  const talks = new Map<string, SpeakerTalkPosts>()
  for (const row of rows) {
    const [post] = toWallPosts([row])
    if (!post) continue
    const talk = talks.get(row.talkId) ?? {
      talkId: row.talkId,
      title: row.title ?? 'Untitled talk',
      hidden: row.hidden,
      posts: [],
    }
    talk.posts.push(post)
    talks.set(row.talkId, talk)
  }
  return [...talks.values()]
}
