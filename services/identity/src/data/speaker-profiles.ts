// Global speaker profile (#2093): owned by the person, read by organizers
// through the directory. The owner paths take the session user only; the
// directory returns the opaque id, never user_id or email.
import { MemberError } from './members'

export const VISIBILITIES = ['private', 'network', 'public'] as const
export type Visibility = (typeof VISIBILITIES)[number]

const MAX_NAME = 120
const MAX_BIO = 4000
const MAX_LINKS = 10
const MAX_LINK = 500
const MAX_TOPICS = 20
const MAX_TOPIC = 60
// An R2 object key only, never a URL: nothing renders external photos yet.
const PHOTO_KEY = /^[A-Za-z0-9/_.-]{1,200}$/
const MAX_QUERY = 100
export const MAX_PAGE = 100

const bad = (m: string) => new MemberError('BAD_USER_INPUT', m)

export interface ProfileInput {
  name?: string | null
  bio?: string | null
  photoKey?: string | null
  links?: string[] | null
  topics?: string[] | null
  visibility?: string | null
}

export interface Profile {
  id: string
  name: string
  bio: string
  photoKey: string | null
  links: string[]
  topics: string[]
  visibility: Visibility
  updatedAt: number
}

interface Row {
  id: string
  name: string
  bio: string
  photo_key: string | null
  links: string
  topics: string
  visibility: Visibility
  updated_at: number
}

const toProfile = (r: Row): Profile => ({
  id: r.id,
  name: r.name,
  bio: r.bio,
  photoKey: r.photo_key,
  links: JSON.parse(r.links),
  topics: JSON.parse(r.topics),
  visibility: r.visibility,
  updatedAt: r.updated_at,
})

const COLS = 'id, name, bio, photo_key, links, topics, visibility, updated_at'

function text(raw: string, max: number, what: string) {
  const v = raw.trim()
  if (v.length > max) throw bad(`${what} too long`)
  return v
}

function link(raw: string) {
  if (raw.length > MAX_LINK) throw bad('Link too long')
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw bad('Links must be https URLs')
  }
  if (u.protocol !== 'https:' || u.username || u.password)
    throw bad('Links must be https URLs')
  return u.href
}

/** Merges input over the current profile and validates the result. */
export function validate(input: ProfileInput, current?: Profile) {
  const name = text(input.name ?? current?.name ?? '', MAX_NAME, 'Name')
  if (!name) throw bad('Name is required')
  const links = input.links ?? current?.links ?? []
  if (links.length > MAX_LINKS) throw bad('Too many links')
  const topics = (input.topics ?? current?.topics ?? []).map((t) =>
    text(t, MAX_TOPIC, 'Topic'),
  )
  if (topics.length > MAX_TOPICS) throw bad('Too many topics')
  if (topics.some((t) => !t)) throw bad('Topics must not be empty')
  // New profiles are private until the speaker opts in (owner decision, #2022).
  const visibility = input.visibility ?? current?.visibility ?? 'private'
  if (!(VISIBILITIES as readonly string[]).includes(visibility))
    throw bad('Unknown visibility')
  const photoKey =
    input.photoKey === undefined ? (current?.photoKey ?? null) : input.photoKey
  if (
    photoKey &&
    (!PHOTO_KEY.test(photoKey) || photoKey.split('/').includes('..'))
  )
    throw bad('Photo key must be an R2 object key')
  return {
    name,
    bio: text(input.bio ?? current?.bio ?? '', MAX_BIO, 'Bio'),
    photoKey: photoKey || null,
    links: links.map(link),
    topics,
    visibility: visibility as Visibility,
  }
}

export function createSpeakerProfiles(db: D1Database) {
  const mine = async (userId: string) => {
    const r = await db
      .prepare(`SELECT ${COLS} FROM speaker_profile WHERE user_id = ?1`)
      .bind(userId)
      .first<Row>()
    return r ? toProfile(r) : null
  }
  return {
    mine,
    /**
     * What the cfp subgraph needs to find the user's Sanity speaker and
     * snapshot their profile (#2078): the safe match keys only (provider
     * accounts and the login email when verified, as the site's login and
     * #2094's import match), plus the profile. Never the display email of an
     * unverified user, never tokens.
     */
    async speakerLink(userId: string) {
      const [accounts, verified, profile] = await Promise.all([
        db
          .prepare(
            'SELECT providerId, accountId FROM account WHERE userId = ?1',
          )
          .bind(userId)
          .all<{ providerId: string; accountId: string }>(),
        db
          .prepare('SELECT email FROM user WHERE id = ?1 AND emailVerified = 1')
          .bind(userId)
          .first<{ email: string }>(),
        mine(userId),
      ])
      return {
        providers: accounts.results.map(
          (a) => `${a.providerId}:${a.accountId}`,
        ),
        emails: verified ? [verified.email.trim().toLowerCase()] : [],
        profile: profile && {
          name: profile.name,
          bio: profile.bio,
          links: profile.links,
          photoKey: profile.photoKey,
        },
      }
    },
    /** Creates on first update; later updates merge over the stored profile. */
    async update(userId: string, input: ProfileInput) {
      const v = validate(input, (await mine(userId)) ?? undefined)
      const now = Date.now()
      const r = await db
        .prepare(
          `INSERT INTO speaker_profile (user_id, id, name, bio, photo_key, links, topics, visibility, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
           ON CONFLICT (user_id) DO UPDATE SET name = ?3, bio = ?4, photo_key = ?5, links = ?6, topics = ?7, visibility = ?8, updated_at = ?9
           RETURNING ${COLS}`,
        )
        .bind(
          userId,
          crypto.randomUUID(),
          v.name,
          v.bio,
          v.photoKey,
          JSON.stringify(v.links),
          JSON.stringify(v.topics),
          v.visibility,
          now,
        )
        .first<Row>()
      return toProfile(r!)
    },
    /**
     * network and public profiles only, ordered by opaque id. At most four
     * bound parameters per page, far under D1's 100.
     */
    async directory(
      first: number,
      after?: string | null,
      query?: string | null,
    ) {
      const limit = Math.min(Math.max(first, 1), MAX_PAGE)
      const q = query?.trim().slice(0, MAX_QUERY).toLowerCase() || null
      const { results } = await db
        .prepare(
          `SELECT ${COLS} FROM speaker_profile
           WHERE visibility IN ('network', 'public')
             AND (?1 IS NULL OR id > ?1)
             AND (?2 IS NULL OR instr(lower(name || ' ' || topics || ' ' || bio), ?2) > 0)
           ORDER BY id LIMIT ?3`,
        )
        .bind(after ?? null, q, limit + 1)
        .all<Row>()
      const nodes = results.slice(0, limit).map(toProfile)
      return {
        nodes,
        endCursor: nodes.at(-1)?.id ?? null,
        hasNextPage: results.length > limit,
      }
    },
  }
}
