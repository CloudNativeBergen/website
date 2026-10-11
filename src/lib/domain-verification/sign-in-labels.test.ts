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
        'Verify the domain before attendees can sign in to workshops on this host.',
    })
  })
})
