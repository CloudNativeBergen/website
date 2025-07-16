import { Speaker, SpeakerListResponse, SpeakerResponse } from '@/lib/speaker/types'
import { NextResponse } from 'next/server'

export function speakerListResponseError(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any,
  message: string,
  type = 'server',
  status = 500,
) {
  console.error(error)

  const response = new NextResponse(
    JSON.stringify({
      error: { message, type },
      status,
    } as SpeakerListResponse),
    { status },
  )
  response.headers.set('cache-control', 'no-store')

  return response
}

export function speakerListResponse(speakers: Speaker[]) {
  const response = NextResponse.json({ speakers } as SpeakerListResponse)
  response.headers.set('cache-control', 'no-store')
  return response
}

export function speakerResponseError(
  options: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error?: any,
    message: string,
    type?: string,
    status?: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validationErrors?: any[]
  }
) {
  const { error, message, type = 'server', status = 500, validationErrors } = options
  
  if (error) {
    console.error(error)
  }

  const response = new NextResponse(
    JSON.stringify({
      error: { message, type, validationErrors },
      status,
    } as SpeakerResponse),
    { status },
  )
  response.headers.set('cache-control', 'no-store')

  return response
}

export function speakerResponse(speaker: Speaker | null) {
  const response = NextResponse.json({ speaker } as SpeakerResponse)
  response.headers.set('cache-control', 'no-store')
  return response
}
