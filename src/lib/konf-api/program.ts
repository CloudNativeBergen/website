import 'server-only'
// Public program reads through the Konf gateway (#1772): the schedule, the
// public speaker list, a speaker profile and a speaker's talks. Each maps the
// API back to the exact shape the Sanity read returns, so pages do not change.
// Each query asks for ONE root: the gateway's cost limit (1000) is summed per
// operation and the full program alone is ~900.
//
// Callers gate on the tenant's `apiRead` flag (apiHost) and fall back to
// Sanity on any throw. The cached readers throw on failure, so a failure is
// never stored.
import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import { findOutboundOrigin } from '@/lib/conference/baseUrl'
import { rolloutFlags } from '@/lib/conference/konf-api'
import { clientReadCached } from '@/lib/sanity/client'
import { konfApiHeaders, konfApiUrl } from './client'
import { graphql, type ResultOf } from './graphql'

const TIMEOUT_MS = 2000

/* eslint-disable @typescript-eslint/no-unused-vars -- typing only */
const PROGRAM = `query { program { days { id date slots {
  start end placeholder hasTalkRef talkStatus trackIndex position
  track { name description sponsorId }
  talk { id title description format level language audiences hasFeedbackCode
    topics { id title color slug description }
    speakers { id name slug title image } }
} } } }` as const
const PROGRAM_DOC = graphql(PROGRAM)

const TALK = `id title description format level language
  topics { id title slug }
  speakers { id name slug title image }
  attachments { key kind attachmentType title description filename url }
  scheduleInfo { date trackTitle startTime endTime }` as const

const PROFILE = `query($slug: String!) { speakerBySlug(slug: $slug) {
  id name title bio links flags image
  galleryImages { id url alt photographer date location featured image speakers { id name slug } }
  talks { ${TALK} }
} }` as const
const PROFILE_DOC = graphql(PROFILE)

const TALKS =
  `query($id: ID!) { speaker(id: $id) { talks { ${TALK} } } }` as const

const SPEAKERS = `query { speakers {
  id updatedAt name title slug image bio links flags
  talks { id title format language level audiences topics { id title color } }
} }` as const
const SPEAKERS_DOC = graphql(SPEAKERS)
/* eslint-enable @typescript-eslint/no-unused-vars */

type Program = ResultOf<typeof PROGRAM_DOC>
type ApiSlot = NonNullable<
  NonNullable<NonNullable<Program['program']>['days']>[number]['slots']
>[number]
type Profile = NonNullable<ResultOf<typeof PROFILE_DOC>['speakerBySlug']>
type ApiTalk = NonNullable<Profile['talks']>[number]
type ApiSpeaker = NonNullable<ResultOf<typeof SPEAKERS_DOC>['speakers']>[number]

/** One uncached gateway read. Throws on HTTP or GraphQL errors. */
export async function read<T>(
  host: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = konfApiUrl()
  if (!url) throw new Error('KONF_API_URL is not set on this environment')
  const res = await fetch(url, {
    method: 'POST',
    // Cached across visitors, so no client IP (see konfApiHeaders).
    headers: await konfApiHeaders(host),
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as { data?: T; errors?: unknown[] }
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors))
  if (!json.data) throw new Error('no data')
  return json.data
}

type Candidate = {
  _id: string
  domains?: readonly string[] | null
  organization?: { _ref: string } | null
}

/**
 * The gateway host for this conference when its tenant has `apiRead`, else
 * null. The host comes from the conference's own `domains[]` (as
 * mergeConference does), never from a request. KONF_API_DISABLED=1 gives null
 * (rolloutFlags returns all off).
 */
export async function apiHost(conf: Candidate): Promise<string | null> {
  try {
    const origin = findOutboundOrigin(conf)
    if (!origin) return null
    const host = new URL(origin).host
    const flags = await rolloutFlags(host, {
      _id: conf._id,
      organization: conf.organization ?? undefined,
    })
    return flags.apiRead ? host : null
  } catch (err) {
    console.warn(`[konf-api] no API host for ${conf._id}:`, err)
    return null
  }
}

/** The domains and org of a conference id, for {@link apiHost}. */
async function conferenceCandidate(
  conferenceId: string,
): Promise<Candidate | null> {
  'use cache'
  cacheLife('hours')
  cacheTag(conferenceTag(conferenceId))
  return clientReadCached.fetch<Candidate | null>(
    // groq-global-scoped: callers pass the server-resolved conference id; this
    // reads back that one conference's domains and org.
    `*[_type == "conference" && _id == $conferenceId][0]{ _id, domains, organization }`,
    { conferenceId },
  )
}

/** {@link apiHost} for a conference known only by id. */
export async function apiHostForConference(
  conferenceId: string,
): Promise<string | null> {
  if (process.env.KONF_API_DISABLED === '1') return null
  try {
    const conf = await conferenceCandidate(conferenceId)
    return conf ? apiHost(conf) : null
  } catch (err) {
    console.warn(`[konf-api] no API host for ${conferenceId}:`, err)
    return null
  }
}

// --- Mapping back to the Sanity shapes ---------------------------------------

const json = (v: string | null | undefined) =>
  v == null ? null : (JSON.parse(v) as unknown)
/** Drop null and undefined keys: `...` in GROQ copies only present fields. */
const present = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v != null))

const STATUS = {
  CONFIRMED: 'confirmed',
  WITHDRAWN: 'withdrawn',
  PENDING: 'accepted',
} as const

/** A slot as SCHEDULE_TRACKS projects it. */
function toTrackTalk(sl: ApiSlot) {
  const t = sl.talk
  const confirmed = sl.talkStatus === 'CONFIRMED'
  return {
    startTime: sl.start,
    endTime: sl.end,
    placeholder: sl.placeholder,
    hasTalkRef: sl.hasTalkRef === true,
    talk: t && {
      ...(t.id != null && { _id: t.id }),
      format: t.format,
      level: t.level,
      status: sl.talkStatus ? STATUS[sl.talkStatus] : null,
      hasFeedbackCode: t.hasFeedbackCode,
      audiences: t.audiences,
      topics:
        t.topics?.map((x) => ({
          _id: x.id,
          title: x.title,
          color: x.color,
          slug: x.slug == null ? null : { current: x.slug },
          description: x.description,
        })) ?? null,
      ...(confirmed && {
        title: t.title,
        description: json(t.description),
        language: t.language,
        speakers:
          t.speakers?.map((s) => ({
            _id: s.id,
            name: s.name,
            slug: s.slug,
            title: s.title,
            image: s.image,
          })) ?? null,
      }),
    },
  }
}

/**
 * The schedule days as EXPANDED_SCHEDULES returns them (`_id`, `date`,
 * `tracks`), or null before programDate (the API returns no days then; the
 * caller falls back to Sanity). Not carried: the schedule document's other
 * `...` fields (`_rev`, `status`, `version`, `owner`), and a track with no
 * slots.
 */
export async function fetchApiSchedules(host: string, conferenceId: string) {
  'use cache: remote'
  cacheLife('hours')
  cacheTag('content:conferences')
  cacheTag(conferenceTag(conferenceId))
  const data = await read<Program>(host, PROGRAM)
  const days = data.program?.days ?? []
  if (days.length === 0) return null
  return days.map((d) => {
    const tracks: {
      trackTitle: string | null
      trackDescription: string | null
      sponsor: { _type: 'reference'; _ref: string } | null
      talks: { position: number; slot: ReturnType<typeof toTrackTalk> }[]
    }[] = []
    for (const sl of d.slots ?? []) {
      const i = sl.trackIndex ?? 0
      tracks[i] ??= {
        trackTitle: sl.track?.name ?? null,
        trackDescription: sl.track?.description ?? null,
        sponsor: sl.track?.sponsorId
          ? { _type: 'reference', _ref: sl.track.sponsorId }
          : null,
        talks: [],
      }
      tracks[i].talks.push({
        position: sl.position ?? 0,
        slot: toTrackTalk(sl),
      })
    }
    return {
      _id: d.id,
      date: d.date,
      tracks: tracks.filter(Boolean).map(({ talks, ...tr }) => ({
        ...tr,
        talks: talks.sort((a, b) => a.position - b.position).map((x) => x.slot),
      })),
    }
  })
}

/** A talk as PUBLIC_TALK_FIELDS returns it (the raw row toPublicTalk maps). */
function toTalkRow(t: ApiTalk) {
  const si = t.scheduleInfo
  return {
    _id: t.id,
    title: t.title,
    description: json(t.description),
    language: t.language,
    level: t.level,
    format: t.format,
    attachments:
      t.attachments?.map((a) =>
        present({
          _type: a.kind === 'file' ? 'fileAttachment' : 'urlAttachment',
          _key: a.key,
          attachmentType: a.attachmentType,
          title: a.title,
          description: a.description,
          filename: a.filename,
          url: a.url,
        }),
      ) ?? null,
    speakers:
      t.speakers?.map((s) => ({
        _id: s.id,
        name: s.name,
        title: s.title,
        slug: s.slug,
        image: s.image,
      })) ?? null,
    topics:
      t.topics?.map((x) => ({ _id: x.id, title: x.title, slug: x.slug })) ??
      null,
    scheduleInfo: si
      ? {
          date: si.date,
          trackTitle: si.trackTitle,
          timeSlot:
            si.startTime == null && si.endTime == null
              ? null
              : { startTime: si.startTime, endTime: si.endTime },
        }
      : { date: null, trackTitle: null, timeSlot: null },
  }
}

/** Raw talk rows of a speaker's confirmed talks, as store.listPublicTalks. */
export async function fetchApiSpeakerTalks(
  host: string,
  conferenceId: string,
  speakerId: string,
): Promise<unknown[]> {
  'use cache: remote'
  cacheLife('hours')
  cacheTag('content:speakers')
  cacheTag(conferenceTag(conferenceId))
  const data = await read<{ speaker: Pick<Profile, 'talks'> | null }>(
    host,
    TALKS,
    { id: speakerId },
  )
  return (data.speaker?.talks ?? []).map(toTalkRow)
}

/**
 * The speaker row and talk rows store.getPublicSpeaker and
 * store.listPublicTalks return, or null for an unknown slug. `flags` holds
 * the public ones only (`local`, all the profile shows); a gallery image's
 * `_rev`, `_createdAt`, `_updatedAt` and its speakers' raw `image` are not
 * carried.
 */
export async function fetchApiSpeakerProfile(
  host: string,
  conferenceId: string,
  slug: string,
) {
  'use cache: remote'
  cacheLife('hours')
  cacheTag('content:speaker-detail')
  cacheTag(conferenceTag(conferenceId))
  const data = await read<ResultOf<typeof PROFILE_DOC>>(host, PROFILE, {
    slug,
  })
  const sp = data.speakerBySlug
  if (!sp) return null
  return {
    speaker: {
      name: sp.name,
      title: sp.title,
      bio: sp.bio,
      links: sp.links,
      flags: sp.flags,
      image: sp.image,
      galleryImages: sp.galleryImages?.map((g) => ({
        _id: g.id,
        image: json(g.image),
        imageUrl: g.url,
        imageAlt: g.alt,
        photographer: g.photographer,
        date: g.date,
        location: g.location,
        featured: g.featured,
        speakers:
          g.speakers?.map((x) => ({
            _id: x.id,
            name: x.name,
            slug: x.slug,
          })) ?? null,
      })),
    },
    talks: (sp.talks ?? []).map(toTalkRow),
  }
}

/**
 * The public speaker list as getSpeakers(conferenceId) rows, the fields the
 * /speaker page and the sitemap use. Not carried: the rest of the speaker
 * document's `...`, and a proposal's `speakers` refs and `conference`.
 */
export async function fetchApiSpeakers(host: string, conferenceId: string) {
  'use cache: remote'
  cacheLife('hours')
  cacheTag('content:speakers')
  cacheTag(conferenceTag(conferenceId))
  const data = await read<{ speakers: ApiSpeaker[] | null }>(host, SPEAKERS)
  return (data.speakers ?? []).map((s) => ({
    _id: s.id,
    _updatedAt: s.updatedAt,
    name: s.name,
    title: s.title,
    slug: s.slug,
    image: s.image,
    bio: s.bio,
    links: s.links,
    flags: s.flags,
    proposals: (s.talks ?? []).map((t) => ({
      _id: t.id,
      title: t.title,
      status: 'confirmed',
      format: t.format,
      language: t.language,
      level: t.level,
      audiences: t.audiences,
      topics:
        t.topics?.map((x) => ({
          _id: x.id,
          title: x.title,
          color: x.color,
        })) ?? null,
    })),
  }))
}
