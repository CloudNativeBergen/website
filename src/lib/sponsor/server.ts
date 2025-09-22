import { NextResponse } from 'next/server'
import { ConferenceSponsorResponse } from './types'

export function conferenceSponsorResponse(
  success: boolean = true,
): NextResponse {
  const response: ConferenceSponsorResponse = {
    success,
  }
  return NextResponse.json(response)
}

export function conferenceSponsorResponseError({
  message,
  type = 'server',
  status = 500,
}: {
  error?: Error
  message: string
  type?: string
  status?: number
}): NextResponse {
  const response: ConferenceSponsorResponse = {
    error: {
      message,
      type,
      status,
    },
  }
  return NextResponse.json(response, { status })
}
