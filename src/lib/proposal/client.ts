import {
  Action,
  ProposalInput,
  ProposalActionResponse,
  ProposalListResponse,
  ProposalResponse,
} from '@/lib/proposal/types'

export async function listProposals(): Promise<ProposalListResponse> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/proposal`, {
    cache: 'no-store',
    next: { revalidate: 0 },
  })
  return (await res.json()) as ProposalListResponse
}

export async function listAllProposals(): Promise<ProposalListResponse> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/proposal/all`, {
    cache: 'no-store',
    next: { revalidate: 0 },
  })
  return (await res.json()) as ProposalListResponse
}

export async function getProposal(id?: string): Promise<ProposalResponse> {
  let url = `${process.env.NEXT_PUBLIC_URL}/api/proposal`
  if (id) {
    url += `/${id}`
  }

  const res = await fetch(url, { cache: 'no-store', next: { revalidate: 0 } })
  return (await res.json()) as ProposalResponse
}

export async function postProposal(
  proposal: ProposalInput,
  id?: string,
  pendingCoSpeakerEmails?: string[],
): Promise<ProposalResponse> {
  if (id === 'new') id = undefined

  let url = `${process.env.NEXT_PUBLIC_URL}/api/proposal`
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
    body: JSON.stringify({
      ...proposal,
      pendingCoSpeakerEmails: pendingCoSpeakerEmails || []
    }),
  })

  return (await res.json()) as ProposalResponse
}

export async function postProposalAction(
  id: string,
  action: Action,
  notify: boolean,
  comment: string,
): Promise<ProposalActionResponse> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_URL}/api/proposal/${id}/action`,
    {
      next: { revalidate: 0 },
      cache: 'no-store',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, notify, comment }),
    },
  )

  return (await res.json()) as ProposalActionResponse
}

export interface NextUnreviewedProposalResponse {
  nextProposal: {
    _id: string
    title: string
    status: string
    speaker?: {
      _id: string
      name: string
    }
  } | null
  error?: string
}

export async function fetchNextUnreviewedProposal(
  currentProposalId?: string,
): Promise<NextUnreviewedProposalResponse> {
  const url = new URL(
    `${process.env.NEXT_PUBLIC_URL || ''}/api/proposal/next-unreviewed`,
  )

  if (currentProposalId) {
    url.searchParams.set('currentProposalId', currentProposalId)
  }

  const res = await fetch(url.toString(), {
    cache: 'no-store',
    next: { revalidate: 0 },
  })

  return (await res.json()) as NextUnreviewedProposalResponse
}

export async function searchProposals(
  query: string,
): Promise<ProposalListResponse> {
  const searchParams = new URLSearchParams({ q: query })
  const res = await fetch(`/api/proposal/search?${searchParams}`, {
    cache: 'no-store',
    next: { revalidate: 0 },
  })

  return (await res.json()) as ProposalListResponse
}
