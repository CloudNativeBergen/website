import { ProposalListResponse } from '../types'

export interface NextUnreviewedProposalResponse {
  nextProposal: {
    _id: string
    title: string
    status: string
    speakers?: {
      _id: string
      name: string
    }[]
  } | null
  error?: string
}

export async function adminFetchNextUnreviewedProposal(
  currentProposalId?: string,
  visitedIds: string[] = [],
): Promise<NextUnreviewedProposalResponse> {
  let url = `/admin/api/proposals/next-unreviewed`

  const params = new URLSearchParams()
  if (currentProposalId) {
    params.append('currentProposalId', currentProposalId)
  }
  if (visitedIds.length > 0) {
    params.append('visitedIds', visitedIds.join(','))
  }

  if (params.toString()) {
    url += `?${params.toString()}`
  }

  const res = await fetch(url, {
    cache: 'no-store',
    next: { revalidate: 0 },
  })

  return (await res.json()) as NextUnreviewedProposalResponse
}

export async function adminSearchProposals(
  query: string,
): Promise<ProposalListResponse> {
  const searchParams = new URLSearchParams({ q: query })
  const res = await fetch(`/admin/api/proposals/search?${searchParams}`, {
    cache: 'no-store',
    next: { revalidate: 0 },
  })

  return (await res.json()) as ProposalListResponse
}
