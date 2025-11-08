/**
 * DEPRECATED: This endpoint was used for Ed25519 did:key verification
 *
 * RSA mode uses /api/badge/issuer#key-1 for public key verification instead.
 * This route is kept for backward compatibility with legacy badges but should
 * be removed once all badges are migrated to RSA.
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error:
        'This endpoint is deprecated. RSA badges use /api/badge/issuer#key-1 for verification.',
      migration: 'Please use the issuer profile endpoint instead',
    },
    { status: 410 }, // 410 Gone
  )
}
