/**
 * Generate Ed25519 key pair for badge signing
 * Run: npx tsx scripts/generate-badge-keys.ts
 */

async function generateKeys() {
  const { utils } = await import('@noble/ed25519')

  // Generate a random private key
  const privateKey = utils.randomSecretKey()
  const publicKey = await utils.getExtendedPublicKeyAsync(privateKey)

  // Convert to hex strings
  const privateKeyHex = Buffer.from(privateKey).toString('hex')
  const publicKeyHex = Buffer.from(publicKey.pointBytes).toString('hex')

  console.log('\n🔐 Generated Ed25519 Key Pair for Badge Signing\n')
  console.log('Add these to your .env.local file:\n')
  console.log(`BADGE_ISSUER_PRIVATE_KEY=${privateKeyHex}`)
  console.log(`BADGE_ISSUER_PUBLIC_KEY=${publicKeyHex}`)
  console.log(`BADGE_ISSUER_URL=http://localhost:3000`)
  console.log(
    '\n⚠️  Keep the private key secret! Never commit it to version control.\n',
  )
}

generateKeys().catch(console.error)
