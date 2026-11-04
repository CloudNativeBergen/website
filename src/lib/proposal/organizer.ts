/**
 * The organizer proposal projection (#1887): what the admin proposal list
 * reads about a proposal. Plain and serializable, with no Sanity refs and no
 * raw documents, shaped like the future konf API type so a second backend only
 * has to produce these fields. {@link toOrganizerProposal} copies exactly these
 * fields and nothing else.
 *
 * Client-safe on purpose: client components import the type from here, never
 * from `./server`.
 */
import type { PortableTextBlock } from 'sanity'
import type { CoSpeakerInvitationMinimal } from '@/lib/cospeaker/types'
import type { ReviewSummary } from '@/lib/review/summary'
import type { Attachment } from '@/lib/attachment/types'
import type { Flags } from '@/lib/speaker/types'
import type { Audience, Format, Language, Level, Status } from './types'

export interface OrganizerProposalConference {
  _id: string
  title: string
  startDate?: string
  endDate?: string
}

export interface OrganizerProposalTopic {
  _id: string
  title: string
  color: string
  slug: { current: string }
  description?: string
}

/** A speaker's accepted or confirmed talk at another edition. */
export interface OrganizerPreviousTalk {
  _id: string
  title: string
  status: Status
  _createdAt: string
  conference?: { _id: string; title: string; startDate?: string }
  topics?: { _id: string; title: string; color: string }[]
}

export interface OrganizerProposalSpeaker {
  _id: string
  name: string
  email: string
  providers?: string[]
  image?: string
  flags?: Flags[]
  slug?: string
  previousAcceptedTalks?: OrganizerPreviousTalk[]
}

export interface OrganizerReview {
  _id: string
  _createdAt: string
  _updatedAt: string
  comment: string
  score: { content: number; relevance: number; speaker: number }
  reviewer: { _id: string; name: string; email: string; image?: string }
}

export interface OrganizerProposal {
  _id: string
  _createdAt: string
  title: string
  description: PortableTextBlock[]
  language: Language
  format: Format
  level: Level
  audiences: Audience[]
  outline: string
  status: Status
  topics?: OrganizerProposalTopic[]
  speakers?: OrganizerProposalSpeaker[]
  conference: OrganizerProposalConference
  reviews?: OrganizerReview[]
  reviewSummary?: ReviewSummary | null
  coSpeakerInvitations?: CoSpeakerInvitationMinimal[]
  attachments?: Attachment[]
}

/** Another talk by a speaker, with the review aggregates the detail rates it by. */
export interface OrganizerTalkSummary extends OrganizerPreviousTalk {
  reviewCount?: number
  reviewScores?: { total: number; weight?: number }[]
}

export interface OrganizerProposalDetailSpeaker extends OrganizerProposalSpeaker {
  title?: string
  bio?: string
  links?: string[]
  submittedTalks?: OrganizerTalkSummary[]
  previousAcceptedTalks?: OrganizerTalkSummary[]
}

/**
 * The admin proposal detail (#1887): {@link OrganizerProposal} plus what the
 * detail tree (ProposalDetail, AdminActionBar, ReviewPanel, PublishedContent)
 * reads beyond the list. {@link toOrganizerProposalDetail} copies exactly these.
 */
export interface OrganizerProposalDetail extends OrganizerProposal {
  _updatedAt: string
  withdrawnReason?: string
  speakers?: OrganizerProposalDetailSpeaker[]
}

/* eslint-disable @typescript-eslint/no-explicit-any -- raw store rows */
const ref = (x: any) => x && { _id: x._id, title: x.title }

const previousTalk = (t: any): OrganizerPreviousTalk => ({
  _id: t._id,
  title: t.title,
  status: t.status,
  _createdAt: t._createdAt,
  conference: t.conference && {
    ...ref(t.conference),
    startDate: t.conference.startDate,
  },
  topics: t.topics?.map((x: any) => x && { ...ref(x), color: x.color }),
})

const speaker = (s: any): OrganizerProposalSpeaker => ({
  _id: s._id,
  name: s.name,
  email: s.email,
  providers: s.providers,
  image: s.image,
  flags: s.flags,
  slug: s.slug,
  previousAcceptedTalks: s.previousAcceptedTalks?.map(
    (t: any) => t && previousTalk(t),
  ),
})

const topic = (t: any): OrganizerProposalTopic => ({
  _id: t._id,
  title: t.title,
  color: t.color,
  slug: t.slug && { current: t.slug.current },
  description: t.description,
})

const review = (r: any): OrganizerReview => ({
  _id: r._id,
  _createdAt: r._createdAt,
  _updatedAt: r._updatedAt,
  comment: r.comment,
  score: r.score && {
    content: r.score.content,
    relevance: r.score.relevance,
    speaker: r.score.speaker,
  },
  reviewer: r.reviewer && {
    _id: r.reviewer._id,
    name: r.reviewer.name,
    email: r.reviewer.email,
    image: r.reviewer.image,
  },
})

/** Map a raw store row to an {@link OrganizerProposal}, copying only its fields. */
export function toOrganizerProposal(raw: any): OrganizerProposal {
  return {
    _id: raw._id,
    _createdAt: raw._createdAt,
    title: raw.title,
    description: raw.description,
    language: raw.language,
    format: raw.format,
    level: raw.level,
    audiences: raw.audiences,
    outline: raw.outline,
    status: raw.status,
    topics: raw.topics?.map((t: any) => t && topic(t)),
    speakers: raw.speakers?.map((s: any) => s && speaker(s)),
    conference: raw.conference && {
      ...ref(raw.conference),
      startDate: raw.conference.startDate,
      endDate: raw.conference.endDate,
    },
    reviews: raw.reviews?.map((r: any) => r && review(r)),
    reviewSummary: raw.reviewSummary,
    coSpeakerInvitations: raw.coSpeakerInvitations,
    attachments: raw.attachments,
  }
}
const talkSummary = (t: any): OrganizerTalkSummary => ({
  ...previousTalk(t),
  reviewCount: t.reviewCount,
  reviewScores: t.reviewScores?.map(
    (r: any) => r && { total: r.total, weight: r.weight },
  ),
})

const detailSpeaker = (s: any): OrganizerProposalDetailSpeaker => ({
  ...speaker(s),
  title: s.title,
  bio: s.bio,
  links: s.links,
  submittedTalks: s.submittedTalks?.map((t: any) => t && talkSummary(t)),
  previousAcceptedTalks: s.previousAcceptedTalks?.map(
    (t: any) => t && talkSummary(t),
  ),
})

/** Map a raw store row to an {@link OrganizerProposalDetail}, copying only its fields. */
export function toOrganizerProposalDetail(raw: any): OrganizerProposalDetail {
  return {
    ...toOrganizerProposal(raw),
    _updatedAt: raw._updatedAt,
    withdrawnReason: raw.withdrawnReason,
    speakers: raw.speakers?.map((s: any) => s && detailSpeaker(s)),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
