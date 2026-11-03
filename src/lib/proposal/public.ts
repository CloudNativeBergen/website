/**
 * The public talk projection (#1887): what the public speaker profile and its
 * Open Graph image read about a confirmed talk. Plain and serializable, shaped
 * like the future konf API type, so a second backend only has to produce these
 * fields. {@link toPublicTalk} copies exactly these fields and nothing else, so
 * an organizer-only field (reviews, notes, status, emails) that a wider store
 * read happens to return can never reach a public page.
 */
import type { PortableTextBlock } from 'sanity'
import type { Attachment } from '@/lib/attachment/types'
import type { Format, Language, Level, ScheduleInfo } from './types'

export interface PublicTalkSpeaker {
  _id: string
  name: string
  title?: string
  slug?: string
  image?: string
}

export interface PublicTalkTopic {
  _id: string
  title: string
  slug?: string
}

export interface PublicTalk {
  _id: string
  title: string
  description?: PortableTextBlock[] | string
  language?: Language
  level?: Level
  format?: Format
  attachments?: Attachment[]
  speakers?: PublicTalkSpeaker[]
  topics?: PublicTalkTopic[]
  scheduleInfo?: ScheduleInfo
}

/* eslint-disable @typescript-eslint/no-explicit-any -- raw store rows */
const speaker = (s: any): PublicTalkSpeaker => ({
  _id: s._id,
  name: s.name,
  title: s.title,
  slug: s.slug,
  image: s.image,
})

const topic = (t: any): PublicTalkTopic => ({
  _id: t._id,
  title: t.title,
  slug: t.slug,
})

/** Map a raw store row to a {@link PublicTalk}, copying only its fields. */
export function toPublicTalk(raw: any): PublicTalk {
  return {
    _id: raw._id,
    title: raw.title,
    description: raw.description,
    language: raw.language,
    level: raw.level,
    format: raw.format,
    attachments: raw.attachments,
    speakers: raw.speakers?.map((s: any) => s && speaker(s)),
    topics: raw.topics?.map((t: any) => t && topic(t)),
    scheduleInfo: raw.scheduleInfo,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
