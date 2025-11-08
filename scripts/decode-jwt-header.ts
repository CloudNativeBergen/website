/**
 * Decode JWT header to verify jwk is included
 * Usage: npx tsx scripts/decode-jwt-header.ts <jwt-string>
 */

const jwt = process.argv[2]

if (!jwt) {
  console.error('Usage: npx tsx scripts/decode-jwt-header.ts <jwt-string>')
  process.exit(1)
}

const [headerB64, payloadB64] = jwt.split('.')

if (!headerB64 || !payloadB64) {
  console.error('Invalid JWT format')
  process.exit(1)
}

const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'))
const payload = JSON.parse(
  Buffer.from(payloadB64, 'base64url').toString('utf-8'),
)

console.log('JWT Header:')
console.log(JSON.stringify(header, null, 2))
console.log('\n--- Key fields ---')
console.log('Algorithm:', header.alg)
console.log('Type:', header.typ)
console.log('Key ID:', header.kid)
console.log('JWK included:', !!header.jwk)

if (header.jwk) {
  console.log('\nPublic Key JWK:')
  console.log(JSON.stringify(header.jwk, null, 2))
}

console.log('\n--- JWT Claims ---')
console.log('Issuer:', payload.iss)
console.log('Subject:', payload.sub)
console.log('JWT ID:', payload.jti)
console.log('Issued At:', new Date(payload.iat * 1000).toISOString())
console.log('Expires:', new Date(payload.exp * 1000).toISOString())
