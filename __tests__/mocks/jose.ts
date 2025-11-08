/**
 * Mock for jose library
 * Provides minimal JWT signing and verification for tests
 */

import * as ed25519 from '@noble/ed25519'

export interface JWK {
  kty: string
  crv: string
  x: string
  d?: string
}

export async function importJWK(jwk: JWK, alg: string): Promise<CryptoKey> {
  // Return a mock CryptoKey object that contains the JWK data
  return jwk as unknown as CryptoKey
}

export class SignJWT {
  private payload: Record<string, unknown> = {}
  private protectedHeader: Record<string, unknown> = {}

  constructor(payload: Record<string, unknown>) {
    this.payload = payload
  }

  setProtectedHeader(header: Record<string, unknown>): this {
    this.protectedHeader = header
    return this
  }

  setIssuedAt(iat: number): this {
    this.payload.iat = iat
    return this
  }

  setExpirationTime(exp: number): this {
    this.payload.exp = exp
    return this
  }

  setNotBefore(nbf: number): this {
    this.payload.nbf = nbf
    return this
  }

  setJti(jti: string): this {
    this.payload.jti = jti
    return this
  }

  setIssuer(iss: string): this {
    this.payload.iss = iss
    return this
  }

  async sign(key: CryptoKey): Promise<string> {
    const jwk = key as unknown as JWK

    // Create JWT header and payload
    const header = Buffer.from(JSON.stringify(this.protectedHeader)).toString(
      'base64url',
    )
    const payload = Buffer.from(JSON.stringify(this.payload)).toString(
      'base64url',
    )

    // Sign using Ed25519
    const message = new TextEncoder().encode(`${header}.${payload}`)
    const privateKeyBytes = Buffer.from(jwk.d!, 'base64url')
    const signature = await ed25519.signAsync(message, privateKeyBytes)
    const signatureB64 = Buffer.from(signature).toString('base64url')

    return `${header}.${payload}.${signatureB64}`
  }
}

export async function jwtVerify(
  jwt: string,
  key: CryptoKey,
  options?: { algorithms?: string[] },
): Promise<{ payload: Record<string, unknown> }> {
  const jwk = key as unknown as JWK

  const [headerB64, payloadB64, signatureB64] = jwt.split('.')

  // Decode payload
  const payload = JSON.parse(
    Buffer.from(payloadB64, 'base64url').toString('utf-8'),
  )

  // Verify signature
  const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const signature = Buffer.from(signatureB64, 'base64url')
  const publicKeyBytes = Buffer.from(jwk.x, 'base64url')

  const isValid = await ed25519.verifyAsync(signature, message, publicKeyBytes)

  if (!isValid) {
    throw new Error('JWT signature verification failed')
  }

  return { payload }
}
