import {
  Proposal,
  ProposalListResponse,
  ProposalResponse,
} from '@/types/proposal';


export async function listProposals(): Promise<ProposalListResponse> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/cfp`, { cache: 'no-store', next: { revalidate: 0 } })
  return await res.json() as ProposalListResponse
}

export async function getProposal(id?: string): Promise<ProposalResponse> {
  let url = `${process.env.NEXT_PUBLIC_URL}/api/cfp`
  if (id) {
    url += `/${id}`
  }

  const res = await fetch(url, { cache: 'no-store', next: { revalidate: 0 } })
  return await res.json() as ProposalResponse
}

export async function postProposal(proposal: Proposal, id?: string): Promise<ProposalResponse> {
  let url = `${process.env.NEXT_PUBLIC_URL}/api/cfp`
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
  });

  return await res.json() as ProposalResponse
}