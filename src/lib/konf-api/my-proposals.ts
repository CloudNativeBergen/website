import 'server-only'
// Speaker portal proposal reads through the Konf gateway (#2078).
// User-scoped: authenticated as the user via identityJwt(), never cached.
// Maps the API shape back to the ProposalExisting shape the CFP pages consume.
import { headers } from 'next/headers'
import type { Topic } from '@/lib/topic/types'
import { konfApiHeaders, konfApiUrl } from './client'
import { identityJwt } from './conference-write'
import { graphql, type ResultOf } from './graphql'
import type {
  Audience,
  Format,
  Language,
  Level,
  ProposalExisting,
  Status,
} from '@/lib/proposal/types'
import type { Attachment, AttachmentType } from '@/lib/attachment/types'
import type { InvitationStatus } from '@/lib/cospeaker/types'
import type { Speaker } from '@/lib/speaker/types'
import type { Conference } from '@/lib/conference/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal/utils/validation'

const TIMEOUT_MS = 5000

/* eslint-disable @typescript-eslint/no-unused-vars -- typing only */
const MY_PROPOSAL_FIELDS = `
  id
  status
  title
  abstract
  description
  format
  level
  language
  audiences
  topicIds
  outline
  prerequisites
  capacity
  tos
  withdrawnReason
  conference { id }
  scheduleInfo { date trackTitle startTime endTime }
  speakers { id name email slug image }
  attachments { key kind attachmentType title description filename url uploadedAt }
  coSpeakerInvitations { id invitedEmail invitedName status expiresAt createdAt respondedAt }
` as const

const MY_PROPOSALS = `query {
  myProposals {
    ${MY_PROPOSAL_FIELDS}
  }
}` as const
const MY_PROPOSALS_DOC = graphql(MY_PROPOSALS)
/* eslint-enable @typescript-eslint/no-unused-vars */

type ApiProposal = NonNullable<
  NonNullable<ResultOf<typeof MY_PROPOSALS_DOC>['myProposals']>[number]
>
function toProposalExisting(t: ApiProposal): ProposalExisting {
  const si = t.scheduleInfo
  return {
    _id: t.id ?? '',
    _type: 'talk',
    _rev: '',
    _createdAt: '',
    _updatedAt: '',
    status: (t.status ?? 'draft') as Status,
    title: t.title ?? '',
    description: t.description
      ? convertStringToPortableTextBlocks(
          t.description as Parameters<
            typeof convertStringToPortableTextBlocks
          >[0],
        )
      : [],
    language: (t.language ?? 'english') as Language,
    format: (t.format ?? 'presentation_25') as Format,
    level: (t.level ?? 'beginner') as Level,
    audiences: (t.audiences ?? []).filter((x): x is string =>
      Boolean(x),
    ) as Audience[],
    outline: t.outline ?? '',
    prerequisites: t.prerequisites ?? undefined,
    capacity: t.capacity ?? undefined,
    tos: Boolean(t.tos),
    withdrawnReason: t.withdrawnReason ?? undefined,
    conference: { _id: t.conference?.id ?? '' } as Conference,
    speakers: (t.speakers ?? []).flatMap((s) =>
      s?.id
        ? [
            {
              _id: s.id,
              name: s.name ?? '',
              email: s.email ?? '',
              slug: s.slug ?? '',
              image: s.image ?? undefined,
            } as Speaker,
          ]
        : [],
    ),
    // Ids only: no list consumer reads topic titles. The editor (which saves
    // topics) stays on Sanity.
    topics: (t.topicIds ?? []).flatMap((id) =>
      id ? [{ _id: id } as Topic] : [],
    ),
    scheduleInfo: si?.date
      ? {
          date: si.date,
          trackTitle: si.trackTitle ?? undefined,
          timeSlot:
            si.startTime || si.endTime
              ? {
                  startTime: si.startTime ?? '',
                  endTime: si.endTime ?? '',
                }
              : undefined,
        }
      : undefined,
    attachments: (t.attachments ?? []).flatMap((a): Attachment[] => {
      if (!a || !a.key) return []
      if (a.kind === 'file') {
        return [
          {
            _type: 'fileAttachment' as const,
            _key: a.key,
            attachmentType: (a.attachmentType ?? '') as AttachmentType,
            title: a.title ?? undefined,
            description: a.description ?? undefined,
            filename: a.filename ?? undefined,
            uploadedAt: a.uploadedAt ?? undefined,
            url: a.url ?? undefined,
            file: {
              _type: 'file' as const,
              asset: {
                _type: 'reference' as const,
                _ref: '',
              },
            },
          },
        ]
      }
      return [
        {
          _type: 'urlAttachment' as const,
          _key: a.key,
          url: a.url ?? '',
          attachmentType: (a.attachmentType ?? '') as AttachmentType,
          title: a.title ?? undefined,
          description: a.description ?? undefined,
          uploadedAt: a.uploadedAt ?? undefined,
        },
      ]
    }),
    coSpeakerInvitations: (t.coSpeakerInvitations ?? []).flatMap((i) =>
      i?.id
        ? [
            {
              _id: i.id,
              invitedEmail: i.invitedEmail ?? '',
              invitedName: i.invitedName ?? undefined,
              status: (i.status === 'pending' &&
              i.expiresAt &&
              new Date(i.expiresAt) < new Date()
                ? 'expired'
                : (i.status ?? 'pending')) as InvitationStatus,
              expiresAt: i.expiresAt ?? '',
              createdAt: i.createdAt ?? undefined,
              respondedAt: i.respondedAt ?? undefined,
            },
          ]
        : [],
    ),
  }
}

async function userRead<T>(
  host: string,
  query: string,
  variables: Record<string, unknown> | undefined,
  userJwt: string,
): Promise<{
  data?: T
  errors?: { message: string; extensions?: { code?: string } }[]
}> {
  const url = konfApiUrl()
  if (!url) throw new Error('KONF_API_URL is not set on this environment')
  const incoming = await headers().catch(() => undefined)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...(await konfApiHeaders(host, incoming)),
      authorization: `Bearer ${userJwt}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: T
    errors?: { message: string; extensions?: { code?: string } }[]
  }
  return json
}

/**
 * Fetch the authenticated speaker's proposals in the conference (identified by host).
 * Returns mapped ProposalExisting[] or throws on error.
 */
export async function fetchMyProposals(
  host: string,
  userJwt?: string,
): Promise<ProposalExisting[]> {
  const jwt = userJwt ?? (await identityJwt())
  if (!jwt) throw new Error('no identity token')
  const json = await userRead<ResultOf<typeof MY_PROPOSALS_DOC>>(
    host,
    MY_PROPOSALS,
    undefined,
    jwt,
  )
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }
  if (!json.data) throw new Error('no data')
  const list = json.data.myProposals ?? []
  return list.flatMap((p) => (p ? [toProposalExisting(p)] : []))
}
