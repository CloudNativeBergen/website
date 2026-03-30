import { ProposalListResponse, ProposalExisting } from '../types'
import { NextResponse } from 'next/server'

export function proposalListResponseError(
  error: Error | unknown,
  message: string,
  type = 'server',
  status = 500,
) {
  console.error(error)

  const response = new NextResponse(
    JSON.stringify({
      error: { message, type },
      status,
    } as ProposalListResponse),
    { status },
  )
  response.headers.set('cache-control', 'no-store')

  return response
}

export function proposalListResponse(proposals: ProposalExisting[]) {
  const response = NextResponse.json({ proposals } as ProposalListResponse)
  response.headers.set('cache-control', 'no-store')
  return response
}
