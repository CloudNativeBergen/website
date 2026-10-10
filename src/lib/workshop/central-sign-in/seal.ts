import 'server-only'
import { hkdfSync } from 'node:crypto'
import { EncryptJWT, jwtDecrypt } from 'jose'
import type { z } from 'zod'

/**
 * THE SEAL of the central workshop sign-in (#1311, spec §5): authenticated
 * encryption, nothing stored. One password (`WORKOS_COOKIE_PASSWORD`), ONE KEY
 * PER PURPOSE: the key is derived with the purpose as its label, so a value
 * sealed for one purpose does not decrypt as another. A hand-off token is
 * never a session, and the reverse.
 *
 * The lifetime is inside the seal (`exp`) and is checked with no tolerance.
 *
 * Whoever holds the password can issue any of these, a session included. It
 * must differ in every environment.
 */
export type SealPurpose =
  /** The OAuth `state` the auth host sends to WorkOS and gets back. */
  | 'auth-state'
  /** The auth host's cookie that binds a callback to the browser that started. */
  | 'auth-start'
  /** What the auth host hands to the tenant host. */
  | 'handoff'
  /** The tenant host's own session. */
  | 'session'

const MIN_PASSWORD_LENGTH = 32

function keyFor(purpose: SealPurpose): Uint8Array {
  const password = process.env.WORKOS_COOKIE_PASSWORD
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `WORKOS_COOKIE_PASSWORD must be set and at least ${MIN_PASSWORD_LENGTH} characters long`,
    )
  }
  return new Uint8Array(
    hkdfSync('sha256', password, '', `konf:workshop:${purpose}:v1`, 32),
  )
}

/** Seal `payload` for `purpose`, valid for `ttlSeconds` from now. */
export async function seal(
  purpose: SealPurpose,
  payload: Record<string, unknown>,
  ttlSeconds: number,
): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .encrypt(keyFor(purpose))
}

/**
 * What was sealed for `purpose`, or `null`: not a seal, another purpose,
 * another password, changed, expired, or not the shape `schema` describes.
 */
export async function unseal<T>(
  purpose: SealPurpose,
  sealed: string | null | undefined,
  schema: z.ZodType<T>,
): Promise<T | null> {
  if (!sealed) return null
  try {
    const { payload } = await jwtDecrypt(sealed, keyFor(purpose), {
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
      requiredClaims: ['exp'],
    })
    const parsed = schema.safeParse(payload)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
