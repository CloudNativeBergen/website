import { NextAuthRequest } from '@/lib/auth'
import { NextResponse } from 'next/server'

/**
 * Check if the authenticated user is an organizer
 * @param req The NextAuth request object
 * @returns Response object if unauthorized, null if authorized
 */
export function checkOrganizerAccess(req: NextAuthRequest) {
  // Check if user is authenticated
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

  // Check if user is an organizer
  if (!req.auth.speaker.is_organizer) {
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
