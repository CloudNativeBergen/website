/**
 * @vitest-environment node
 *
 * CONTRACT test for the `@auth/core` JWT salt ↔ session-cookie-name binding the
 * app hardcodes — the exact class of assumption that broke during the Phase-2
 * provider-linking work (#451). It runs a REAL `encode` → `decode` round-trip
 * through the actual library (bearer.test.ts confirms the crypto is real: the
 * `jose` alias in vitest.config does not reach `@auth/core`'s internals), so an
 * Auth.js upgrade that changes salt→key derivation would fail this test instead
 * of silently breaking session/CLI-token reads in production.
 *
 * What it pins:
 *   - both session-cookie-name salts (`authjs.session-token` bare + the
 *     `__Secure-` prod form) round-trip;
 *   - the salt is LOAD-BEARING — a token minted under one salt does NOT decode
 *     under the other, which is exactly why src/lib/auth.ts `readPriorSessionToken`
 *     must try each cookie name as its own salt;
 *   - the CLI bearer salt (`CLI_JWT_SALT`) equals the bare cookie name;
 *   - a wrong secret is rejected.
 *
 * The salts are the app's OWN exported constants (`SESSION_TOKEN_COOKIE_NAMES`,
 * `CLI_JWT_SALT`), imported from src/lib/auth.ts, and asserted against the
 * known-correct `@auth/core` default strings — so this guards the app, not a
 * copy. (`@auth/core` is only a transitive dep here, so its `defaultCookies()`
 * can't be imported to diff automatically; a rename must update auth.ts, which
 * this test then flags against the reference strings.)
 */
import { describe, it, expect } from 'vitest'
import { encode, decode } from 'next-auth/jwt'
import { SESSION_TOKEN_COOKIE_NAMES, CLI_JWT_SALT } from '@/lib/auth'

const SECRET = 'contract-test-secret-long-enough-for-a256cbc-hs512'
const OTHER_SECRET = 'a-totally-different-secret-of-sufficient-length!!'

// The REAL constants the app uses (salt === session-cookie name), imported from
// src/lib/auth.ts so these assertions guard the app — not a copy.
const [PROD_COOKIE, DEV_COOKIE] = SESSION_TOKEN_COOKIE_NAMES
const CLI_SALT = CLI_JWT_SALT

const payload = { sub: 'user-1', name: 'Ada', email: 'ada@example.com' }

/** `decode` rejects a bad token by returning null OR throwing; treat both alike. */
async function tryDecode(token: string, secret: string, salt: string) {
  try {
    return await decode({ token, secret, salt })
  } catch {
    return null
  }
}

describe('@auth/core JWT contract — salt ↔ cookie-name binding', () => {
  it('round-trips a token minted and read with the bare dev cookie salt', async () => {
    const token = await encode({
      token: payload,
      secret: SECRET,
      salt: DEV_COOKIE,
      maxAge: 3600,
    })
    const decoded = await decode({ token, secret: SECRET, salt: DEV_COOKIE })
    expect(decoded?.sub).toBe('user-1')
  })

  it('round-trips a token minted and read with the __Secure- prod cookie salt', async () => {
    const token = await encode({
      token: payload,
      secret: SECRET,
      salt: PROD_COOKIE,
      maxAge: 3600,
    })
    const decoded = await decode({ token, secret: SECRET, salt: PROD_COOKIE })
    expect(decoded?.sub).toBe('user-1')
  })

  it('binds a token to its salt: a dev-cookie token does NOT decode under the prod-cookie salt', async () => {
    const token = await encode({
      token: payload,
      secret: SECRET,
      salt: DEV_COOKIE,
      maxAge: 3600,
    })
    expect(await tryDecode(token, SECRET, PROD_COOKIE)).toBeNull()
  })

  it('binds a token to its salt: a prod-cookie token does NOT decode under the dev-cookie salt', async () => {
    const token = await encode({
      token: payload,
      secret: SECRET,
      salt: PROD_COOKIE,
      maxAge: 3600,
    })
    expect(await tryDecode(token, SECRET, DEV_COOKIE)).toBeNull()
  })

  it('rejects a token decoded under the wrong secret', async () => {
    const token = await encode({
      token: payload,
      secret: SECRET,
      salt: DEV_COOKIE,
      maxAge: 3600,
    })
    expect(await tryDecode(token, OTHER_SECRET, DEV_COOKIE)).toBeNull()
  })

  it('CLI bearer salt equals the bare session-cookie name (getSessionFromBearerToken contract)', async () => {
    // CLI_JWT_SALT and SESSION_TOKEN_COOKIE_NAMES are declared independently in
    // auth.ts; this fails if they drift apart (getSessionFromBearerToken must
    // decode tokens minted under the same salt the session cookie uses).
    expect(CLI_SALT).toBe(DEV_COOKIE)
    const token = await encode({
      token: payload,
      secret: SECRET,
      salt: CLI_SALT,
      maxAge: 3600,
    })
    const decoded = await decode({ token, secret: SECRET, salt: CLI_SALT })
    expect(decoded?.sub).toBe('user-1')
  })

  it('documents the exact session-cookie names the app depends on', () => {
    // If an Auth.js upgrade renames the session cookie, update BOTH
    // src/lib/auth.ts (readPriorSessionToken baseNames + CLI_JWT_SALT) and this
    // reference deliberately.
    expect(DEV_COOKIE).toBe('authjs.session-token')
    expect(PROD_COOKIE).toBe('__Secure-authjs.session-token')
  })
})
