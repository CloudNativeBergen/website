/**
 * #866. `vitest.config.ts` aliases `jose` to `__tests__/mocks/jose.ts` for the
 * ENTIRE suite, and that mock ignores the key: its importers hand back their
 * input and `jwtVerify` only compares a deterministic string. Every other
 * badge test therefore passes a JWT signed with key A against key B, so the
 * legacy JWT badges still served by `/api/badge/[badgeId]/verify` and
 * `/api/badge/[badgeId]/achievement` had no test anywhere touching RS256 or
 * Ed25519 signature mathematics.
 *
 * This file is the one place the alias is defeated, so it is the only place
 * where "the signature is wrong" can actually be observed. Every assertion
 * here goes through the production `verifyCredentialJWT`; none of it tests
 * jose itself.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest'
import { generateKeyPairSync } from 'crypto'
import * as jose from 'jose'
import {
  createCredential,
  signCredentialJWT,
  verifyCredentialJWT,
  VerificationError,
} from '@/lib/openbadges'
import type { CredentialConfig } from '@/lib/openbadges'

// `vi.unmock` does not reach a resolve-level alias — the alias rewrites the
// specifier before the mocker ever sees it. A factory does reach it: it is
// keyed on the RESOLVED id, so it replaces the mock for this file's whole
// module graph, `crypto.ts` included. Node's own resolver is used to find the
// real package, since any specifier starting with `jose` is aliased.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

const BASE_URL = 'https://example.com'

function credentialConfig(id: string): CredentialConfig {
  return {
    credentialId: `${BASE_URL}/api/badge/${id}`,
    name: 'Speaker Badge for Test Conference 2026',
    issuer: {
      id: `${BASE_URL}/api/badge/issuer`,
      name: 'Test Conference Org',
      url: BASE_URL,
      email: 'badges@example.com',
      description: 'Test issuer',
    },
    subject: {
      id: 'mailto:speaker.name@example.com',
      type: ['AchievementSubject'],
    },
    achievement: {
      id: `${BASE_URL}/api/badge/${id}/achievement`,
      name: 'Speaker at Test Conference 2026',
      description: 'Recognizes a speaker at Test Conference 2026.',
      criteria: { narrative: 'Presented a talk at Test Conference 2026.' },
      image: { id: `${BASE_URL}/api/badge/${id}/image`, type: 'Image' },
    },
    validFrom: '2026-01-01T00:00:00Z',
  }
}

const VERIFICATION_METHOD = `${BASE_URL}/api/badge/keys/key-1`

function rsaKeyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
}

/** The EdDSA path takes raw 32-byte hex, not PEM. */
function ed25519KeyPair(): { privateKey: string; publicKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const priv = privateKey.export({ format: 'jwk' })
  const pub = publicKey.export({ format: 'jwk' })
  return {
    privateKey: Buffer.from(priv.d as string, 'base64url').toString('hex'),
    publicKey: Buffer.from(pub.x as string, 'base64url').toString('hex'),
  }
}

/**
 * A guard, not a formality: if the factory above ever stops defeating the
 * alias, every test below would silently go back to asserting nothing.
 */
describe('the alias is actually defeated', () => {
  it('loaded the real jose, not the mock', async () => {
    expect(typeof jose.generateKeyPair).toBe('function')

    await expect(
      jose.importSPKI(
        '-----BEGIN PUBLIC KEY-----\nnot-a-key\n-----END PUBLIC KEY-----\n',
        'RS256',
      ),
    ).rejects.toThrow()
  })
})

describe.each([
  ['RS256', () => ({ a: rsaKeyPair(), b: rsaKeyPair() })],
  ['EdDSA', () => ({ a: ed25519KeyPair(), b: ed25519KeyPair() })],
])('verifyCredentialJWT signature mathematics (%s)', (alg, makeKeys) => {
  let keys: ReturnType<typeof makeKeys>
  let jwt: string

  beforeAll(async () => {
    keys = makeKeys()
    jwt = await signCredentialJWT(createCredential(credentialConfig(alg)), {
      privateKey: keys.a.privateKey,
      publicKey: keys.a.publicKey,
      verificationMethod: VERIFICATION_METHOD,
    })
  })

  it('verifies a credential it signed itself', async () => {
    const credential = await verifyCredentialJWT(jwt, keys.a.publicKey)
    expect(credential.id).toBe(`${BASE_URL}/api/badge/${alg}`)
  })

  it('rejects a credential verified against a different key', async () => {
    await expect(verifyCredentialJWT(jwt, keys.b.publicKey)).rejects.toThrow(
      VerificationError,
    )
  })

  it('rejects a tampered signature', async () => {
    const [header, payload, signature] = jwt.split('.')
    const flipped = signature[0] === 'A' ? 'B' : 'A'
    const tampered = `${header}.${payload}.${flipped}${signature.slice(1)}`

    await expect(
      verifyCredentialJWT(tampered, keys.a.publicKey),
    ).rejects.toThrow(VerificationError)
  })

  it('rejects claims edited under an untouched signature', async () => {
    const [header, payload, signature] = jwt.split('.')
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    claims.credentialSubject.id = 'mailto:attacker@example.com'
    const forged = `${header}.${Buffer.from(JSON.stringify(claims)).toString(
      'base64url',
    )}.${signature}`

    await expect(verifyCredentialJWT(forged, keys.a.publicKey)).rejects.toThrow(
      VerificationError,
    )
  })
})
