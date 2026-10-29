/** Wording shared by the organizer's domain card and system status. */
import { describe, it, expect } from 'vitest'
import { workshopSignInLabel } from './sign-in-labels'

describe('workshopSignInLabel', () => {
  it('available', () => {
    expect(workshopSignInLabel({ state: 'available' })).toEqual({
      status: 'ok',
      label: 'available',
      detail: null,
    })
  })

  it('domain not verified', () => {
    expect(workshopSignInLabel({ state: 'unverified' })).toEqual({
      status: 'warn',
      label: 'domain not verified',
      detail:
        'Attendees cannot sign in to workshops on this host until the domain is verified. For a domain of your own, publish the TXT record shown on the domain card in Settings, then press Check now. For a host the platform provided, contact the platform operator.',
    })
  })

  it('switched off on every host: the deployment’s sign-in host cannot be used', () => {
    expect(
      workshopSignInLabel({ state: 'blocked', by: 'origin-unusable' }),
    ).toEqual({
      status: 'error',
      label: 'switched off on every host',
      detail:
        'The platform’s sign-in host is not set up correctly (WORKSHOP_AUTH_ORIGIN), so attendees cannot sign in to workshops on any host. The domain is verified; contact the platform operator.',
    })
  })

  it('not available on the sign-in host itself', () => {
    expect(workshopSignInLabel({ state: 'blocked', by: 'auth-host' })).toEqual({
      status: 'error',
      label: 'not available on the sign-in host',
      detail:
        'This host is the platform’s own sign-in host (WORKSHOP_AUTH_ORIGIN), which serves no conference, so attendees cannot sign in to workshops on it. The domain is verified; contact the platform operator.',
    })
  })
})
