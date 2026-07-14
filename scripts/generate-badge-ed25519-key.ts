#!/usr/bin/env node
/**
 * Generate an Ed25519 seed for OpenBadges 3.0 embedded Data Integrity Proofs
 * (eddsa-rdfc-2022 cryptosuite).
 *
 * The 32-byte seed is the private key: the public key, publicKeyMultibase and
 * did:key are all derived from it.
 *
 * Two environment variables are printed:
 *   - BADGE_ISSUER_ED25519_SEED        (SECRET — used for issuance/signing)
 *   - BADGE_ISSUER_ED25519_PUBLIC_KEY  (safe to expose — used for verification)
 *
 * Usage:
 *   pnpm tsx scripts/generate-badge-ed25519-key.ts
 *   (or: pnpm generate-badge-ed25519-key)
 *
 * Nothing is written to disk; copy the values into your environment.
 */

import { randomBytes } from 'node:crypto'
import { seedToMultikey } from '../src/lib/openbadges'

async function main() {
  console.log(
    'Generating Ed25519 seed for OpenBadges 3.0 embedded proofs (eddsa-rdfc-2022)...\n',
  )

  const seed = randomBytes(32).toString('hex')
  const { publicKeyMultibase, did } = await seedToMultikey(seed)

  console.log('Add these to your environment (e.g. .env.local):\n')
  console.log('# SECRET — private key for issuance/signing. Never commit it.')
  console.log(`BADGE_ISSUER_ED25519_SEED="${seed}"`)
  console.log('')
  console.log(
    '# Public key (multibase) for verification. Safe to expose; it is also',
  )
  console.log('# served from /api/badge/issuer as the #key-ed25519 method.')
  console.log(`BADGE_ISSUER_ED25519_PUBLIC_KEY="${publicKeyMultibase}"`)
  console.log('')
  console.log(
    '⚠️  IMPORTANT: The seed IS the private key. Keep it secret and never',
  )
  console.log(
    '   commit it to version control. The public key is safe to share.',
  )
  console.log('')
  console.log(`For reference, did:key: ${did}`)
}

main().catch((error) => {
  console.error('Failed to generate Ed25519 seed:', error)
  process.exit(1)
})
