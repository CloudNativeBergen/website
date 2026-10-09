/**
 * Where one host stands for the workshop portal's WorkOS sign-in (#1298): the
 * one answer the attendee page, the email link and the organizer surfaces all
 * read. Real allowlist policy; the inputs are the record as stored.
 */
import { describe, it, expect } from 'vitest'
import { verifiedHost } from '../../../__tests__/helpers/workshopSignIn'
import type { RedirectUriState } from './types'
import { workshopSignInStanding } from './sign-in-standing'

const now = new Date()
const HOST = 'conf.example.org'

function redirectUri(state: Partial<RedirectUriState> = {}): RedirectUriState {
  return { status: null, id: null, error: null, ...state }
}

describe('workshopSignInStanding', () => {
  it.each([
    ['registered', redirectUri({ status: 'registered', id: 'ru_1' })],
    ['external', redirectUri({ status: 'external' })],
  ])(
    'is ready for a verified host whose redirect URI WorkOS has (%s)',
    (_label, state) => {
      expect(
        workshopSignInStanding({
          record: verifiedHost(HOST),
          redirectUri: state,
          platformControlled: true,
          now,
        }),
      ).toEqual({ state: 'ready' })
    },
  )

  it('is pending for a platform-controlled verified host WorkOS has not got yet', () => {
    expect(
      workshopSignInStanding({
        record: verifiedHost(HOST),
        redirectUri: redirectUri(),
        platformControlled: true,
        now,
      }),
    ).toEqual({ state: 'pending' })
  })

  it('is failed, with the recorded error, when the registration was rejected', () => {
    expect(
      workshopSignInStanding({
        record: verifiedHost(HOST),
        redirectUri: redirectUri({ error: 'WorkOS 422: invalid uri' }),
        platformControlled: true,
        now,
      }),
    ).toEqual({ state: 'failed', error: 'WorkOS 422: invalid uri' })
  })

  it('is not offered on a verified host that is not platform-controlled and not registered', () => {
    expect(
      workshopSignInStanding({
        record: verifiedHost(HOST),
        redirectUri: redirectUri({ error: 'stale error' }),
        platformControlled: false,
        now,
      }),
    ).toEqual({ state: 'not-offered' })
  })

  it.each([
    ['no record', null],
    [
      'an unproven claim',
      verifiedHost(HOST, { status: 'pending', lastSuccessAt: null }),
    ],
    [
      'a proof that stopped resolving',
      verifiedHost(HOST, { status: 'failing' }),
    ],
    ['a revoked claim', verifiedHost(HOST, { status: 'revoked' })],
  ])('is unverified for %s, whatever WorkOS holds', (_label, record) => {
    expect(
      workshopSignInStanding({
        record,
        redirectUri: redirectUri({ status: 'registered', id: 'ru_1' }),
        platformControlled: true,
        now,
      }),
    ).toEqual({ state: 'unverified' })
  })

  it('is unverified when there is no redirect-URI state either', () => {
    expect(
      workshopSignInStanding({
        record: null,
        redirectUri: null,
        platformControlled: false,
        now,
      }),
    ).toEqual({ state: 'unverified' })
  })
})
