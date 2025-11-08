#!/usr/bin/env node
/**
 * Generate RSA-2048 key pair for OpenBadges 3.0 JWT signing
 *
 * OpenBadges 3.0 requires RS256 (RSA with SHA-256) for JWT proof format.
 * This script generates a 2048-bit RSA key pair and outputs them in PEM format.
 *
 * Usage:
 *   npx tsx scripts/generate-rsa-keys.ts
 *
 * The keys will be printed to stdout. Add them to your .env.local:
 *   BADGE_ISSUER_RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
 *   BADGE_ISSUER_RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
 */

import { generateKeyPairSync } from 'crypto'

function generateRSAKeyPair(): {
  privateKey: string
  publicKey: string
} {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  })

  return {
    privateKey,
    publicKey,
  }
}

function main() {
  console.log(
    'Generating RSA-2048 key pair for OpenBadges 3.0 JWT signing...\n',
  )

  const { privateKey, publicKey } = generateRSAKeyPair()

  console.log('✅ RSA key pair generated successfully!\n')
  console.log('Add these to your .env.local file:\n')
  console.log(
    'BADGE_ISSUER_RSA_PRIVATE_KEY="' + privateKey.replace(/\n/g, '\\n') + '"',
  )
  console.log('')
  console.log(
    'BADGE_ISSUER_RSA_PUBLIC_KEY="' + publicKey.replace(/\n/g, '\\n') + '"',
  )
  console.log('')
  console.log(
    '⚠️  IMPORTANT: Keep the private key secret! Never commit it to version control.',
  )
  console.log('')
  console.log('Public Key (for reference):')
  console.log(publicKey)
}

main()
