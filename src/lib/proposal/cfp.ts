import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import { fetchApiCfp, type PublicCfpTalk } from '@/lib/konf-api/cfp'
import { apiHost } from '@/lib/konf-api/program'
import { clientReadCached } from '@/lib/sanity/client'
import type { Topic } from '@/lib/topic/types'
import {
  audiences,
  formats,
  languages,
  levels,
  type Audience,
  type Format,
  type Language,
  type Level,
} from './types'

export interface PublicCfp {
  topics: Topic[]
  talks: PublicCfpTalk[]
  formats: Map<Format, string>
  levels: Map<Level, string>
  languages: Map<Language, string>
  audiences: Map<Audience, string>
}

// groq-global-scoped: callers pass the server-resolved conference id; this
// reads back that one conference's public topics and confirmed talks.
const SANITY_CFP_QUERY = `{
  "conference": *[_type == "conference" && _id == $conferenceId][0]{
    "topics": topics[]->{ _id, title, description, color }
  },
  "talks": *[_type == "talk" && conference._ref == $conferenceId && status == "confirmed"] | order(title asc){
    _id, title, format, level, language, audiences,
    "topicIds": topics[]._ref,
    "speakers": speakers[]->{ _id, name }
  }
}`

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' && v.trim()) || null
const list = (v: unknown) =>
  Array.isArray(v) ? (v as Row[]).filter((x) => x != null) : []
const strs = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
const toMap = <K extends string>(
  rows: readonly { value: K; label: string }[],
) => new Map<K, string>(rows.map(({ value, label }) => [value, label]))

async function fetchSanityCfp(
  conferenceId: string,
  fallbackTopics?: readonly Topic[] | null,
): Promise<{ topics: Topic[]; talks: PublicCfpTalk[] }> {
  'use cache'
  cacheLife('hours')
  cacheTag('content:cfp')
  cacheTag('content:conferences')
  cacheTag(conferenceTag(conferenceId))
  const r = await clientReadCached.fetch<Row | null>(SANITY_CFP_QUERY, {
    conferenceId,
  })
  const conf = r?.conference as Row | null | undefined
  const rawTopics = conf ? conf.topics : (r?.topics ?? fallbackTopics)
  return {
    topics: list(rawTopics)
      .filter((x) => x._id)
      .map((x) => ({
        _id: x._id as string,
        _type: 'topic' as const,
        title: s(x.title) ?? '',
        description: s(x.description) ?? undefined,
        color: s(x.color) ?? '',
        slug: { current: '' },
      })),
    talks: list(r?.talks)
      .filter((x) => x._id)
      .map((x) => ({
        _id: x._id as string,
        title: s(x.title) ?? '',
        format: (s(x.format) ?? null) as Format | null,
        level: (s(x.level) ?? null) as Level | null,
        language: (s(x.language) ?? null) as Language | null,
        audiences: strs(x.audiences) as Audience[],
        topicIds: strs(x.topicIds),
        speakers: list(x.speakers)
          .filter((p) => p._id)
          .map((p) => ({
            _id: p._id as string,
            name: s(p.name) ?? '',
          })),
      })),
  }
}

/**
 * The conference's PUBLIC CFP (#2087): from the gateway for an apiRead tenant,
 * else Sanity. Sanity also answers on any API error and under
 * KONF_API_DISABLED. Carries topics, confirmed talks (speakers { _id, name }
 * only) and the option catalogues. Public pages only; admin, own-proposal and
 * speaker submit/edit flows read Sanity directly.
 */
export async function getPublicCfp(
  conference: Parameters<typeof apiHost>[0] & {
    topics?: readonly Topic[] | null
  },
): Promise<PublicCfp> {
  const host = await apiHost(conference)
  if (host) {
    try {
      const api = await fetchApiCfp(host, conference._id)
      return {
        topics: api.topics,
        talks: api.talks,
        formats: toMap(api.formats),
        levels: toMap(api.levels),
        languages: toMap(api.languages),
        audiences: toMap(api.audiences),
      }
    } catch (err) {
      console.warn(
        `[konf-api] cfp falling back to Sanity for ${host}:`,
        (err as Error).message,
      )
    }
  }
  const sanity = await fetchSanityCfp(conference._id, conference.topics)
  return {
    topics: sanity.topics,
    talks: sanity.talks,
    formats: new Map(formats),
    levels: new Map(levels),
    languages: new Map(languages),
    audiences: new Map(audiences),
  }
}
