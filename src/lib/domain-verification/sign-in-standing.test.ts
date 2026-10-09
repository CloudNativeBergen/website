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
          platformCandidate: true,
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
        platformCandidate: true,
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
        platformCandidate: true,
        now,
      }),
    ).toEqual({ state: 'failed', error: 'WorkOS 422: invalid uri' })
  })

  it('is failed, not ready, when a URI it once registered could not be recreated', () => {
    // `register()` keeps the old id on a failed create and records only the
    // error, so `registered` alone does not mean WorkOS still has the URI.
    expect(
      workshopSignInStanding({
        record: verifiedHost(HOST),
        redirectUri: redirectUri({
          status: 'registered',
          id: 'ru_1',
          error: 'WorkOS POST 500: recreation failed',
        }),
        platformControlled: true,
        platformCandidate: true,
        now,
      }),
    ).toEqual({ state: 'failed', error: 'WorkOS POST 500: recreation failed' })
  })

  it('is not offered on a verified host that can never be platform-controlled', () => {
    expect(
      workshopSignInStanding({
        record: verifiedHost(HOST),
        redirectUri: redirectUri({ error: 'stale error' }),
        platformControlled: false,
        platformCandidate: false,
        now,
      }),
    ).toEqual({ state: 'not-offered' })
  })

  it('is unverified — not "not offered" — for a candidate admitted only by grandfathering', () => {
    // On the allowlist during its grace, but never proven: publishing the TXT
    // record makes it `dns-txt`, and the sync then registers it.
    expect(
      workshopSignInStanding({
        record: verifiedHost(HOST, {
          method: 'grandfathered',
          status: 'pending',
          lastSuccessAt: null,
          graceUntil: new Date(Date.now() + 86_400_000).toISOString(),
        }),
        redirectUri: redirectUri(),
        platformControlled: false,
        platformCandidate: true,
        now,
      }),
    ).toEqual({ state: 'unverified' })
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
        platformCandidate: true,
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
        platformCandidate: true,
        now,
      }),
    ).toEqual({ state: 'unverified' })
  })
})

/**
 * A host that can NEVER carry sign-in — not allocated by the platform, and its
 * conference not the platform organization's — is `not-offered` whatever its
 * proof says, so the organizer is not told that verifying it would help.
 */
describe('workshopSignInStanding — a host the platform will never control', () => {
  it.each([
    [
      'unproven',
      verifiedHost(HOST, { status: 'pending', lastSuccessAt: null }),
    ],
    ['failing', verifiedHost(HOST, { status: 'failing' })],
    ['verified', verifiedHost(HOST)],
  ])('is not offered when %s', (_label, record) => {
    expect(
      workshopSignInStanding({
        record,
        redirectUri: redirectUri(),
        platformControlled: false,
        platformCandidate: false,
        now,
      }),
    ).toEqual({ state: 'not-offered' })
  })

  it('is still unverified for an unproven host that could be controlled', () => {
    expect(
      workshopSignInStanding({
        record: verifiedHost(HOST, { status: 'pending', lastSuccessAt: null }),
        redirectUri: redirectUri(),
        platformControlled: false,
        platformCandidate: true,
        now,
      }),
    ).toEqual({ state: 'unverified' })
  })
})
