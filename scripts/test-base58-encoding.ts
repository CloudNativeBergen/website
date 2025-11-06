#!/usr/bin/env tsx
/**
 * Test script to verify Base58btc encoding for badge public keys
 * Run with: npx tsx scripts/test-base58-encoding.ts
 */

import bs58 from 'bs58'

console.log('🔑 Testing Base58btc Encoding for Badge Public Keys\n')

// Use the public key from environment or a test key
const publicKeyHex =
  process.env.BADGE_ISSUER_PUBLIC_KEY ||
  '6c4cf79d3a8b5e2f1d0c9e7a4b6d8f2a5c1e9b7d4a8f6c2e5b9d1a7f3c8e4b6d'

console.log('Public Key (hex):', publicKeyHex)
console.log(
  'Key length:',
  publicKeyHex.length,
  'chars (',
  publicKeyHex.length / 2,
  'bytes)\n',
)

// Convert hex to bytes
const publicKeyBytes = Buffer.from(publicKeyHex, 'hex')

// Add Ed25519 multicodec prefix (0xed01)
const ed25519Prefix = Buffer.from([0xed, 0x01])
const multikeyBytes = Buffer.concat([ed25519Prefix, publicKeyBytes])

console.log('Multikey bytes length:', multikeyBytes.length, 'bytes')
console.log(
  'Multicodec prefix:',
  `0x${multikeyBytes[0].toString(16)}${multikeyBytes[1].toString(16).padStart(2, '0')}`,
  '(Ed25519)\n',
)

// Encode to Base58btc
const base58Encoded = bs58.encode(multikeyBytes)
const publicKeyMultibase = 'z' + base58Encoded

console.log('Base58btc encoded:', base58Encoded)
console.log('Multibase (with z prefix):', publicKeyMultibase)
console.log('Encoded length:', publicKeyMultibase.length, 'chars\n')

// Validate Base58 characters
const invalidChars = publicKeyMultibase.match(/[^z1-9A-HJ-NP-Za-km-z]/g)
if (invalidChars) {
  console.error('❌ INVALID Base58 characters found:', [
    ...new Set(invalidChars),
  ])
  console.error(
    '   These characters are NOT allowed in Base58: 0, O, I, l, +, /, =, _',
  )
  process.exit(1)
} else {
  console.log('✅ All characters are valid Base58')
}

// Test decoding
try {
  const decoded = bs58.decode(base58Encoded)
  console.log('✅ Successfully decoded back to', decoded.length, 'bytes')

  // Verify it matches
  if (Buffer.compare(decoded, multikeyBytes) === 0) {
    console.log('✅ Decoded bytes match original multikey bytes')
  } else {
    console.error('❌ Decoded bytes do NOT match original')
    process.exit(1)
  }
} catch (error) {
  console.error('❌ Failed to decode:', error)
  process.exit(1)
}

// Test verification method URL
const issuerUrl = process.env.BADGE_ISSUER_URL || 'https://cloudnativebergen.no'
const keyId = `key-${publicKeyHex.substring(0, 8)}`
const verificationMethod = `${issuerUrl}/api/badge/keys/${keyId}`

console.log('\n🔗 Verification Method URL:', verificationMethod)
console.log('✅ All validation checks passed!')
