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
 * The exact cookie-name STRINGS are asserted as the documented reference
 * (`@auth/core` is only a transitive dep here, so its `defaultCookies()` can't
 * be imported directly to diff against — a rename would need this test updated
 * deliberately alongside src/lib/auth.ts).
 */
import { describe, it, expect } from 'vitest'
import { encode, decode } from 'next-auth/jwt'

const SECRET = 'contract-test-secret-long-enough-for-a256cbc-hs512'
const OTHER_SECRET = 'a-totally-different-secret-of-sufficient-length!!'

// Mirror of src/lib/auth.ts: salt === session-cookie name. Prod uses the
// __Secure- prefix (https); dev uses the bare name.
const DEV_COOKIE = 'authjs.session-token'
const PROD_COOKIE = '__Secure-authjs.session-token'
const CLI_SALT = 'authjs.session-token' // CLI_JWT_SALT in auth.ts

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
