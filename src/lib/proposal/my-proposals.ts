import 'server-only'
// The speaker dashboard's own-proposal list through the Konf gateway (#2078):
// cfp subgraph `myProposals`, authenticated as the user. Sanity stays the
// fallback on any error, without an identity token, with KONF_API_DISABLED=1,
// or for a tenant without apiRead. Not cached: the result is per user.
import { apiHost } from '@/lib/konf-api/program'
import { identityJwt } from '@/lib/konf-api/conference-write'
import { fetchMyProposal, fetchMyProposals } from '@/lib/konf-api/my-proposals'
import * as store from './data/sanity'
import type { ProposalExisting } from './types'
import type { Topic } from '@/lib/topic/types'

export async function getMyProposals({
  speakerId,
  conference,
  includeSchedule = true,
}: {
  /** Session speaker; used for the Sanity fallback only, never sent to the API. */
  speakerId: string
  /** Server-resolved conference; picks the API host, never sent as an id. */
  conference: Parameters<typeof apiHost>[0]
  includeSchedule?: boolean
}): Promise<{ proposals: ProposalExisting[]; proposalsError: Error | null }> {
  // KONF_API_DISABLED=1: rolloutFlags answers OFF, so apiHost is null.
  try {
    const host = await apiHost(conference)
    const jwt = host ? await identityJwt() : null
    if (host && jwt) {
      return {
        proposals: await fetchMyProposals(host, jwt),
        proposalsError: null,
      }
    }
  } catch (err) {
    console.warn(
      `[konf-api] myProposals falling back to Sanity for ${conference._id}:`,
      (err as Error).message,
    )
  }

  return store.getProposals({
    speakerId,
    conferenceId: conference._id,
    returnAll: false,
    includeSchedule,
  })
}

/**
 * The speaker's proposal detail page and editor (#2135): `myProposal` on the
 * proposal's OWN conference host (tenant-scoped on purpose), as the user.
 * Sanity serves it on NOT_FOUND, any error, no identity token, a tenant
 * without apiRead, KONF_API_DISABLED=1, and for an impersonating organizer.
 * The id comes from the route; ownership is the API's speaker predicate and,
 * on the fallback, the Sanity read's own. Not cached.
 */
export async function getMyProposal(
  args: Parameters<typeof store.getProposal>[0],
): ReturnType<typeof store.getProposal> {
  if (!args.isOrganizer) {
    try {
      const ctx = await store.getProposalApiContext(args.id, args.speakerId)
      const host = ctx?.conference ? await apiHost(ctx.conference) : null
      const jwt = host ? await identityJwt() : null
      const proposal =
        host && jwt && (await fetchMyProposal(host, args.id, jwt))
      if (proposal && ctx?.conference) {
        const topics = new Map((ctx.topics ?? []).map((t) => [t._id, t]))
        const files = new Map((ctx.files ?? []).map((f) => [f._key, f.file]))
        proposal.conference = ctx.conference as ProposalExisting['conference']
        proposal.topics = (proposal.topics as { _id: string }[]).flatMap((t) =>
          topics.has(t._id) ? [topics.get(t._id) as Topic] : [],
        )
        for (const a of proposal.attachments ?? []) {
          if (a._type === 'fileAttachment' && files.get(a._key)) {
            a.file = files.get(a._key) as typeof a.file
          }
        }
        return { proposal, proposalError: null }
      }
    } catch (err) {
      console.warn(
        `[konf-api] myProposal falling back to Sanity for ${args.id}:`,
        (err as Error).message,
      )
    }
  }
  return store.getProposal(args)
}
