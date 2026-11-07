import 'server-only'
// Public CFP through the Konf gateway (#2087), mapped back to the shapes the
// public CFP, program and speaker pages read. CFP dates and enabled formats
// stay on Conference; talk details live in the program subgraph.
import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import type { Audience, Format, Language, Level } from '@/lib/proposal/types'
import type { Topic } from '@/lib/topic/types'
import { graphql, type ResultOf } from './graphql'
import { read } from './program'

/* eslint-disable @typescript-eslint/no-unused-vars -- typing only */
const CFP = `query { cfp {
  topics { id title description color }
  talks { id title format level language audiences topicIds speakers { id name } }
  formats { value label }
  levels { value label }
  languages { value label }
  audiences { value label }
} }` as const
const CFP_DOC = graphql(CFP)
/* eslint-enable @typescript-eslint/no-unused-vars */

export interface CfpOption<K extends string = string> {
  value: K
  label: string
}

export interface PublicCfpTalk {
  _id: string
  title: string
  format: Format | null
  level: Level | null
  language: Language | null
  audiences: Audience[]
  topicIds: string[]
  speakers: { _id: string; name: string }[]
}

export interface ApiCfp {
  topics: Topic[]
  talks: PublicCfpTalk[]
  formats: CfpOption<Format>[]
  levels: CfpOption<Level>[]
  languages: CfpOption<Language>[]
  audiences: CfpOption<Audience>[]
}

/**
 * The conference's public CFP from the gateway: topics, confirmed talks (id,
 * title, format, level, language, audiences, topicIds, speaker id/name) and
 * the option catalogues. Throws on failure or absent conference, so a failure
 * is never cached.
 */
export async function fetchApiCfp(
  host: string,
  conferenceId: string,
): Promise<ApiCfp> {
  'use cache: remote'
  cacheLife('hours')
  cacheTag('content:cfp')
  cacheTag('content:conferences')
  cacheTag(conferenceTag(conferenceId))
  const data = await read<ResultOf<typeof CFP_DOC>>(host, CFP)
  const cfp = data.cfp
  if (!cfp) throw new Error('no cfp')
  return {
    topics: (cfp.topics ?? []).flatMap((t) =>
      t.id
        ? [
            {
              _id: t.id,
              _type: 'topic' as const,
              title: t.title ?? '',
              description: t.description ?? undefined,
              color: t.color ?? '',
              slug: { current: '' },
            },
          ]
        : [],
    ),
    talks: (cfp.talks ?? []).flatMap((t) =>
      t.id
        ? [
            {
              _id: t.id,
              title: t.title ?? '',
              format: (t.format ?? null) as Format | null,
              level: (t.level ?? null) as Level | null,
              language: (t.language ?? null) as Language | null,
              audiences: (t.audiences ?? []).filter(
                (x): x is Audience => x != null,
              ),
              topicIds: (t.topicIds ?? []).filter(
                (x): x is string => x != null,
              ),
              speakers: (t.speakers ?? []).flatMap((s) =>
                s.id ? [{ _id: s.id, name: s.name ?? '' }] : [],
              ),
            },
          ]
        : [],
    ),
    formats: (cfp.formats ?? []).flatMap(({ value, label }) =>
      value ? [{ value: value as Format, label: label ?? '' }] : [],
    ),
    levels: (cfp.levels ?? []).flatMap(({ value, label }) =>
      value ? [{ value: value as Level, label: label ?? '' }] : [],
    ),
    languages: (cfp.languages ?? []).flatMap(({ value, label }) =>
      value ? [{ value: value as Language, label: label ?? '' }] : [],
    ),
    audiences: (cfp.audiences ?? []).flatMap(({ value, label }) =>
      value ? [{ value: value as Audience, label: label ?? '' }] : [],
    ),
  }
}
