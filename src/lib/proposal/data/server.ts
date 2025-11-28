import {
  ProposalListResponse,
  ProposalResponse,
  FormValidationError,
  ProposalExisting,
} from '../types'
import { NextResponse } from 'next/server'

export function proposalResponseError({
  error,
  message,
  validationErrors,
  type = 'server',
  status = 500,
}: {
  error?: Error | unknown
  message: string
  validationErrors?: FormValidationError[]
  type?: string
  status?: number
}) {
  if (error) {
    console.error(error)
  }

  const response = new NextResponse(
    JSON.stringify({
      error: { message, type, validationErrors },
      status,
    } as ProposalResponse),
    { status },
  )
  response.headers.set('cache-control', 'no-store')

  return response
}

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
