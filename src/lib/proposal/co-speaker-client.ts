import { 
  CoSpeakerInvitation,
  CoSpeakerListResponse,
  CoSpeakerInviteResponse,
  CoSpeakerDeleteResponse
} from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'

export interface CoSpeakerResponse {
  coSpeakers?: Speaker[]
  error?: {
    type: string
    message: string
  }
}

export async function getCoSpeakers(proposalId: string): Promise<CoSpeakerResponse> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_URL}/api/proposal/${proposalId}/co-speakers`,
    {
      cache: 'no-store',
      next: { revalidate: 0 },
    }
  )
  return (await res.json()) as CoSpeakerResponse
}

export async function addCoSpeaker(
  proposalId: string,
  speakerId: string
): Promise<CoSpeakerResponse> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_URL}/api/proposal/${proposalId}/co-speakers`,
    {
      next: { revalidate: 0 },
      cache: 'no-store',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ speakerId }),
    }
  )
  return (await res.json()) as CoSpeakerResponse
}

export async function removeCoSpeaker(
  proposalId: string,
  speakerId: string
): Promise<CoSpeakerDeleteResponse> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_URL}/api/proposal/${proposalId}/co-speakers`,
    {
      next: { revalidate: 0 },
      cache: 'no-store',
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ speakerId }),
    }
  )
  return (await res.json()) as CoSpeakerDeleteResponse
}

export async function sendCoSpeakerInvite(
  proposalId: string,
  email: string,
  name: string
): Promise<CoSpeakerInviteResponse> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_URL}/api/proposal/${proposalId}/co-speakers/invite`,
    {
      next: { revalidate: 0 },
      cache: 'no-store',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, name }),
    }
  )
  return (await res.json()) as CoSpeakerInviteResponse
}

export async function respondToInvite(
  proposalId: string,
  token: string,
  accept: boolean
): Promise<CoSpeakerInviteResponse> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_URL}/api/proposal/${proposalId}/co-speakers/invite`,
    {
      next: { revalidate: 0 },
      cache: 'no-store',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, accept }),
    }
  )
  return (await res.json()) as CoSpeakerInviteResponse
}