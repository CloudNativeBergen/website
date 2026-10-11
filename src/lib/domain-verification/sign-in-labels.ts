/**
 * The organizer's wording for a host's workshop sign-in standing, shared by
 * the domain card and system status. Client-safe.
 */

import type { WorkshopSignInStanding } from './sign-in-standing'

export interface WorkshopSignInLabel {
  status: 'ok' | 'warn'
  label: string
  detail: string | null
}

export function workshopSignInLabel(
  standing: WorkshopSignInStanding,
): WorkshopSignInLabel {
  switch (standing.state) {
    case 'available':
      return { status: 'ok', label: 'available', detail: null }
    case 'unverified':
      return {
        status: 'warn',
        label: 'domain not verified',
        detail:
          'Verify the domain before attendees can sign in to workshops on this host.',
      }
  }
}
