import { NextAuthRequest } from '@/lib/auth'
import { sponsorTierResponseError } from '@/lib/sponsor/server'

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
    return sponsorTierResponseError({
      message: 'Unauthorized - Authentication required',
      type: 'authentication',
      status: 401,
    })
  }

  // Check if user is an organizer
  if (!req.auth.speaker.is_organizer) {
    return sponsorTierResponseError({
      message: 'Forbidden - Organizer access required',
      type: 'authorization',
      status: 403,
    })
  }

  return null
}
