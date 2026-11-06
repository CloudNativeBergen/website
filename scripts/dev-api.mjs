#!/usr/bin/env node
// Local-only keys and tokens for `mise run dev:api` (#1772). Nothing here is a
// production secret: every key is generated on this machine, lives in
// gitignored .dev.vars files and .wrangler/dev-api/, and is useless remotely.
//
//   node scripts/dev-api.mjs setup             keys, .dev.vars, jwks seed SQL
//   node scripts/dev-api.mjs token [user] [origin]   a 5-minute identity JWT
import {
  generateKeyPairSync,
  randomBytes,
  sign,
  createPrivateKey,
} from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const STATE = '.wrangler/dev-api'
const KEYS = `${STATE}/keys.json`
const ISSUER = 'http://localhost:8787'
const OPERATOR_ORIGIN = 'http://localhost:3000'
const KID = 'dev-identity-key'

const pem = (k, type) => k.export({ type, format: 'pem' })
const line = (pemText) => JSON.stringify(pemText)

function setup() {
  mkdirSync(STATE, { recursive: true })
  if (!existsSync(KEYS)) {
    const gw = generateKeyPairSync('ed25519')
    const id = generateKeyPairSync('ed25519')
    writeFileSync(
      KEYS,
      JSON.stringify({
        envelopePrivate: pem(gw.privateKey, 'pkcs8'),
        envelopePublic: pem(gw.publicKey, 'spki'),
        identityPrivate: pem(id.privateKey, 'pkcs8'),
        identityJwk: id.publicKey.export({ format: 'jwk' }),
        secret: randomBytes(32).toString('hex'),
      }),
      { mode: 0o600 },
    )
  }
  const k = JSON.parse(readFileSync(KEYS, 'utf8'))
  const sanity = process.env.SANITY_API_TOKEN_READ ?? ''
  const common = [
    `GATEWAY_PUBLIC_KEY=${line(k.envelopePublic)}`,
    `SANITY_API_TOKEN_READ=${sanity}`,
  ]
  const files = {
    'api/.dev.vars': [
      `ENVELOPE_PRIVATE_KEY=${line(k.envelopePrivate)}`,
      `IDENTITY_ISSUER=${ISSUER}`,
      `OPERATOR_ORIGIN=${OPERATOR_ORIGIN}`,
      `CLIENT_IP_SECRET=${k.secret}`,
    ],
    'services/identity/.dev.vars': [
      ...common,
      `IDENTITY_ISSUER=${ISSUER}`,
      `BETTER_AUTH_URL=${ISSUER}`,
      `BETTER_AUTH_SECRET=${k.secret}`,
      `OPERATOR_ORIGINS=${OPERATOR_ORIGIN}`,
      'GITHUB_CLIENT_ID=dev',
      'GITHUB_CLIENT_SECRET=dev',
      'LINKEDIN_CLIENT_ID=dev',
      'LINKEDIN_CLIENT_SECRET=dev',
    ],
    'services/tenant-directory/.dev.vars': common,
    'services/content/.dev.vars': common,
    'services/conference/.dev.vars': common,
    'services/program/.dev.vars': common,
  }
  for (const [f, lines] of Object.entries(files))
    writeFileSync(
      f,
      `# Local dev only, written by scripts/dev-api.mjs\n${lines.join('\n')}\n`,
      { mode: 0o600 },
    )
  // better-auth serves /api/auth/jwks straight from this table; the private
  // column is never read for verification, so a placeholder is enough.
  writeFileSync(
    `${STATE}/jwks.sql`,
    `INSERT OR REPLACE INTO jwks (id, publicKey, privateKey, alg, crv) VALUES ('${KID}', '${JSON.stringify(k.identityJwk)}', 'dev-placeholder', 'EdDSA', 'Ed25519');\n`,
  )
  if (!sanity)
    console.log(
      'SANITY_API_TOKEN_READ unset: Sanity-backed fields resolve empty (private dataset).',
    )
}

function token(sub = 'user-dev-operator', origin = OPERATOR_ORIGIN) {
  const k = JSON.parse(readFileSync(KEYS, 'utf8'))
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const iat = Math.floor(Date.now() / 1000)
  const input = `${b64({ alg: 'EdDSA', kid: KID, typ: 'JWT' })}.${b64({
    iss: ISSUER,
    aud: 'konf-gateway',
    sub,
    origin,
    iat,
    exp: iat + 300,
  })}`
  const sig = sign(
    null,
    Buffer.from(input),
    createPrivateKey(k.identityPrivate),
  )
  console.log(`${input}.${sig.toString('base64url')}`)
}

const [cmd, ...args] = process.argv.slice(2)
if (cmd === 'setup') setup()
else if (cmd === 'token') token(...args)
else {
  console.error('usage: dev-api.mjs setup | token [userId] [origin]')
  process.exit(2)
}
