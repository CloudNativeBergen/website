import { NextAuthRequest } from '@/lib/auth'
import { NextResponse } from 'next/server'

export function checkOrganizerAccess(req: NextAuthRequest) {
  if (
    !req.auth ||
    !req.auth.user ||
    !req.auth.speaker ||
    !req.auth.speaker._id ||
    !req.auth.account
  ) {
    const response = new NextResponse(
      JSON.stringify({
        error: {
          message: 'Unauthorized - Authentication required',
          type: 'authentication',
        },
        status: 401,
      }),
      { status: 401 },
    )
    response.headers.set('cache-control', 'no-store')
    return response
  }

  if (!req.auth.speaker.isOrganizer) {
    const response = new NextResponse(
      JSON.stringify({
        error: {
          message: 'Forbidden - Organizer access required',
          type: 'authorization',
        },
        status: 403,
      }),
      { status: 403 },
    )
    response.headers.set('cache-control', 'no-store')
    return response
  }

  return null
}
