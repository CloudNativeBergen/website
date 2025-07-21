import {
  Action,
  ProposalInput,
  ProposalActionResponse,
  ProposalListResponse,
  ProposalResponse,
} from '@/lib/proposal/types'

export async function getProposal(id?: string): Promise<ProposalResponse> {
  let url = `/api/proposal`
  if (id) {
    url += `/${id}`
  }

  const res = await fetch(url, { cache: 'no-store', next: { revalidate: 0 } })
  return (await res.json()) as ProposalResponse
}

export async function postProposal(
  proposal: ProposalInput,
  id?: string,
): Promise<ProposalResponse> {
  if (id === 'new') id = undefined

  let url = `/api/proposal`
  let method = 'POST'
  if (id) {
    url += `/${id}`
    method = 'PUT'
  }

  const res = await fetch(url, {
    next: { revalidate: 0 },
    cache: 'no-store',
    method: method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(proposal),
  })

  return (await res.json()) as ProposalResponse
}

export async function postProposalAction(
  id: string,
  action: Action,
  notify: boolean,
  comment: string,
): Promise<ProposalActionResponse> {
  const res = await fetch(`/api/proposal/${id}/action`, {
    next: { revalidate: 0 },
    cache: 'no-store',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, notify, comment }),
  })

  return (await res.json()) as ProposalActionResponse
}

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
): Promise<NextUnreviewedProposalResponse> {
  let url = `/admin/api/proposals/next-unreviewed`

  if (currentProposalId) {
    url += `?currentProposalId=${encodeURIComponent(currentProposalId)}`
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
