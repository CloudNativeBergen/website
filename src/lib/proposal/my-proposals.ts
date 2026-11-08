import 'server-only'
// The speaker dashboard's own-proposal list through the Konf gateway (#2078):
// cfp subgraph `myProposals`, authenticated as the user. Sanity stays the
// fallback on any error, without an identity token, with KONF_API_DISABLED=1,
// or for a tenant without apiRead. Not cached: the result is per user.
//
// The single-proposal page stays on Sanity: MyProposal lacks fields its editor
// uses (see the PR for the contract gaps).
import { apiHost } from '@/lib/konf-api/program'
import { identityJwt } from '@/lib/konf-api/conference-write'
import { fetchMyProposals } from '@/lib/konf-api/my-proposals'
import * as store from './data/sanity'
import type { ProposalExisting } from './types'

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
