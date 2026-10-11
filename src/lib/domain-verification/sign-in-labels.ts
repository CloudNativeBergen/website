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
          'Attendees cannot sign in to workshops on this host until the domain is verified. Publish the TXT record shown on the domain card in Settings, then press Check now.',
      }
  }
}
