/**
 * The organizer's wording for each sign-in standing (#1298), shared by the
 * domain card and system status. Literal on purpose: these sentences are the
 * whole explanation an organizer gets for why attendees cannot sign up.
 */
import { describe, it, expect } from 'vitest'
import { workshopSignInLabel } from './sign-in-labels'

const NOT_YET =
  'Until then workshop sign-up is not available on this host. If it is the conference’s first domain, ticket emails also go out without the portal link.'

describe('workshopSignInLabel', () => {
  it('ready', () => {
    expect(workshopSignInLabel({ state: 'ready' })).toEqual({
      status: 'ok',
      label: 'available',
      detail: null,
    })
  })

  it('unverified', () => {
    expect(workshopSignInLabel({ state: 'unverified' })).toEqual({
      status: 'warn',
      label: 'domain not verified',
      detail: `Sign-in is set up once the domain is verified. ${NOT_YET}`,
    })
  })

  it('pending', () => {
    expect(workshopSignInLabel({ state: 'pending' })).toEqual({
      status: 'warn',
      label: 'registration pending',
      detail: `The domain is verified and sign-in is being registered. This happens automatically, at the latest with the next daily check. ${NOT_YET}`,
    })
  })

  it('failed — the recorded error first, one period however it ends', () => {
    for (const error of [
      'WorkOS 422: invalid uri',
      'WorkOS 422: invalid uri.',
    ]) {
      expect(workshopSignInLabel({ state: 'failed', error })).toEqual({
        status: 'error',
        label: 'registration failed',
        detail: `WorkOS 422: invalid uri. It is retried automatically with the next daily check. ${NOT_YET}`,
      })
    }
  })

  it('not offered', () => {
    expect(workshopSignInLabel({ state: 'not-offered' })).toEqual({
      status: 'warn',
      label: 'not offered on this host',
      detail:
        'Workshop sign-in runs only on hosts the platform controls, such as a host the platform provided for this conference. Workshop sign-up is not available on this host.',
    })
  })

  it('blocked', () => {
    expect(workshopSignInLabel({ state: 'blocked' })).toEqual({
      status: 'error',
      label: 'switched off on every host',
      detail: `WORKOS_COOKIE_DOMAIN is set in the deployment, so workshop sign-in is refused on every host; the platform operator has to unset it. ${NOT_YET}`,
    })
  })
})
