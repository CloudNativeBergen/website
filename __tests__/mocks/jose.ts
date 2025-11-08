/**
 * Mock for jose library
 * Simplified to support RSA keys only for application tests
 * The openbadges library tests use real jose for both RSA and Ed25519
 */

export interface JWK {
  kty: string
  crv?: string
  x?: string
  d?: string
  n?: string
  e?: string
}

export async function importJWK(jwk: JWK, alg: string): Promise<CryptoKey> {
  return jwk as unknown as CryptoKey
}

export async function importPKCS8(
  pem: string,
  alg: string,
): Promise<CryptoKey> {
  return { type: 'rsa-private', pem, alg } as unknown as CryptoKey
}

export async function importSPKI(pem: string, alg: string): Promise<CryptoKey> {
  return { type: 'rsa-public', pem, alg } as unknown as CryptoKey
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

  setSubject(sub: string): this {
    this.payload.sub = sub
    return this
  }

  async sign(key: CryptoKey): Promise<string> {
    const header = Buffer.from(JSON.stringify(this.protectedHeader)).toString(
      'base64url',
    )
    const payload = Buffer.from(JSON.stringify(this.payload)).toString(
      'base64url',
    )

    // For RSA keys in tests, return a deterministic mock signature
    const mockSignature = Buffer.from(
      `mock-signature-${header.slice(0, 8)}-${payload.slice(0, 8)}`,
    ).toString('base64url')

    return `${header}.${payload}.${mockSignature}`
  }
}

export async function jwtVerify(
  jwt: string,
  key: CryptoKey,
  options?: { algorithms?: string[] },
): Promise<{ payload: Record<string, unknown> }> {
  const [headerB64, payloadB64, signatureB64] = jwt.split('.')

  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error('Invalid JWT format')
  }

  // Decode payload
  const payload = JSON.parse(
    Buffer.from(payloadB64, 'base64url').toString('utf-8'),
  )

  // For RSA keys in tests, verify the mock signature matches expected pattern
  const expectedSignature = Buffer.from(
    `mock-signature-${headerB64.slice(0, 8)}-${payloadB64.slice(0, 8)}`,
  ).toString('base64url')

  if (signatureB64 !== expectedSignature) {
    throw new Error('JWT signature verification failed')
  }

  return { payload }
}
