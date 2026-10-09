/**
 * How a host's workshop sign-in standing (#1298) reads to an ORGANIZER: one
 * wording for the domain card and the system-status check. Client-safe.
 * Never shown to attendees, who only learn that sign-up is not available.
 */

import type { WorkshopSignInStanding } from './sign-in-standing'

const NOT_YET =
  'Until then attendees see that workshop sign-up is not available yet, and ticket emails go out without the portal link.'

export interface WorkshopSignInLabel {
  status: 'ok' | 'warn' | 'error' | 'off'
  label: string
  detail: string | null
}

export function workshopSignInLabel(
  standing: WorkshopSignInStanding,
): WorkshopSignInLabel {
  switch (standing.state) {
    case 'ready':
      return { status: 'ok', label: 'available', detail: null }
    case 'unverified':
      return {
        status: 'warn',
        label: 'domain not verified',
        detail: `Sign-in is set up once the domain is verified. ${NOT_YET}`,
      }
    case 'pending':
      return {
        status: 'warn',
        label: 'registration pending',
        detail: `The domain is verified and sign-in is being registered. This happens automatically, at the latest with the next daily check. ${NOT_YET}`,
      }
    case 'failed':
      return {
        status: 'error',
        label: 'registration failed',
        detail: `${standing.error.replace(/\.*$/, '')}. It is retried automatically with the next daily check. ${NOT_YET}`,
      }
    case 'not-offered':
      return {
        status: 'off',
        label: 'not offered on this host',
        detail:
          'Workshop sign-in runs only on hosts the platform controls, such as a host the platform provided for this conference.',
      }
  }
}
