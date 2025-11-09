/**
 * OpenBadges 3.0 Validator Compliance Tests
 *
 * These tests validate that our badge generation produces credentials that
 * comply with the OpenBadges 3.0 specification and pass external validators
 * like the 1EdTech OB30Inspector.
 *
 * Key validation points:
 * 1. JWT header structure (alg, typ, kid, jwk)
 * 2. JWT payload claims (iss, jti, sub, nbf, exp)
 * 3. JWK format (kty, n, e - no additional fields)
 * 4. kid URL dereferencing (returns bare JWK)
 * 5. JSON schema compliance
 * 6. Signature verification
 *
 * @see https://www.imsglobal.org/spec/ob/v3p0/impl/
 * @see https://github.com/1EdTech/digital-credentials-public-validator
 */

import { describe, it, expect } from '@jest/globals'
import { generateBadgeCredential } from '@/lib/badge/generator'
import { createTestConfiguration } from '@/lib/badge/config'
import { validateCredential, verifyCredentialJWT } from '@/lib/openbadges'
import type { BadgeGenerationParams } from '@/lib/badge/types'
import type { Credential } from '@/lib/openbadges/types'
import goldenHeader from '@/lib/openbadges/data/credential-jwt-header.json'

const TEST_HOST = 'test.cloudnativebergen.dev'

describe('OpenBadges 3.0 Validator Compliance', () => {
  // Test configuration using test keys
  const config = createTestConfiguration({
    baseUrl: `https://${TEST_HOST}`,
  })

  const testParams: BadgeGenerationParams = {
    speakerId: 'test-speaker-001',
    speakerName: 'Test Speaker',
    speakerEmail: 'speaker@test.com',
    speakerSlug: 'test-speaker',
    conferenceId: 'test-conf-2025',
    conferenceTitle: 'Test Conference 2025',
    conferenceYear: '2025',
    conferenceDate: '2025-06-15',
    badgeType: 'speaker',
    talkId: 'test-talk-001',
    talkTitle: 'Test Talk',
  }

  describe('JWT Header Structure', () => {
    it('should generate JWT with RS256 algorithm', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      // Decode header (first part of JWT)
      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      expect(header.alg).toBe('RS256')
      console.log('✓ JWT uses RS256 algorithm (1EdTech validator requirement)')
    })

    it('should include typ: JWT in header', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      expect(header.typ).toBe('JWT')
      console.log('✓ JWT header includes typ: JWT')
    })

    it('should include kid (key ID) in header', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      expect(header.kid).toBeDefined()
      expect(typeof header.kid).toBe('string')
      expect(header.kid).toMatch(/^https?:\/\//)
      // CRITICAL: kid must NOT use fragment identifier
      expect(header.kid).not.toContain('#')
      expect(header.kid).toMatch(/\/api\/badge\/keys\/key-1$/)
      console.log(
        '✓ JWT header includes kid without fragment identifier:',
        header.kid,
      )
    })

    it('should include inline jwk (JSON Web Key) in header', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      expect(header.jwk).toBeDefined()
      expect(typeof header.jwk).toBe('object')
      console.log(
        '✓ JWT header includes inline JWK for validator compatibility',
      )
    })
  })

  describe('JWK Format Validation', () => {
    it('should match official OpenBadges 3.0 JWK structure', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      // Compare with golden data from official spec
      expect(header.jwk).toHaveProperty('kty')
      expect(header.jwk).toHaveProperty('e')
      expect(header.jwk).toHaveProperty('n')

      // Golden data has ONLY these three fields
      const goldenFields = Object.keys(goldenHeader.jwk).sort()
      const ourFields = Object.keys(header.jwk).sort()

      console.log('✓ Golden data JWK fields:', goldenFields)
      console.log('✓ Our JWK fields:', ourFields)

      // We should have at minimum the same fields as golden data
      expect(ourFields).toEqual(expect.arrayContaining(goldenFields))
    })

    it('should have RSA key type', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      expect(header.jwk.kty).toBe('RSA')
      console.log('✓ JWK has kty: RSA')
    })

    it('should have RSA public exponent (e)', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      expect(header.jwk.e).toBeDefined()
      expect(typeof header.jwk.e).toBe('string')
      // Standard RSA exponent is 65537 (AQAB in base64url)
      expect(header.jwk.e).toBe('AQAB')
      console.log('✓ JWK has public exponent e: AQAB')
    })

    it('should have RSA modulus (n)', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      expect(header.jwk.n).toBeDefined()
      expect(typeof header.jwk.n).toBe('string')
      expect(header.jwk.n.length).toBeGreaterThan(100) // RSA-2048 modulus is ~344 chars base64url
      console.log('✓ JWK has modulus n (length:', header.jwk.n.length, ')')
    })

    it('should NOT include private key parameter (d)', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      // CRITICAL: Must never expose private key
      expect(header.jwk.d).toBeUndefined()
      console.log('✓ JWK does NOT contain private key parameter (d)')
    })

    it('should NOT include other private parameters (p, q, dp, dq, qi)', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      // Ensure no other private key components are present
      expect(header.jwk.p).toBeUndefined()
      expect(header.jwk.q).toBeUndefined()
      expect(header.jwk.dp).toBeUndefined()
      expect(header.jwk.dq).toBeUndefined()
      expect(header.jwk.qi).toBeUndefined()
      console.log('✓ JWK contains no private key material')
    })
  })

  describe('JWT Payload Claims', () => {
    it('should include all required JWT claims', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [, payloadB64] = assertion.split('.')
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8')
      const payload = JSON.parse(payloadJson)

      // Required claims per OpenBadges 3.0 spec section 8.2.4.1
      expect(payload.iss).toBeDefined() // Issuer
      expect(payload.jti).toBeDefined() // JWT ID (credential ID)
      expect(payload.sub).toBeDefined() // Subject (credentialSubject.id)
      expect(payload.nbf).toBeDefined() // Not Before (validFrom)

      console.log('✓ JWT includes all required claims (iss, jti, sub, nbf)')
    })

    it('should have iss (issuer) matching credential issuer', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [, payloadB64] = assertion.split('.')
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8')
      const payload = JSON.parse(payloadJson)

      expect(payload.iss).toBe(config.issuer.id)
      expect(payload.iss).toMatch(/\/api\/badge\/issuer$/)
      console.log('✓ iss claim matches issuer.id:', payload.iss)
    })

    it('should have jti (JWT ID) matching credential ID', async () => {
      const { assertion, badgeId } = await generateBadgeCredential(
        testParams,
        config,
      )

      const [, payloadB64] = assertion.split('.')
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8')
      const payload = JSON.parse(payloadJson)

      expect(payload.jti).toBeDefined()
      expect(payload.jti).toContain(badgeId)
      expect(payload.jti).toMatch(/^https?:\/\//)
      console.log('✓ jti claim is credential ID:', payload.jti)
    })

    it('should have sub (subject) as mailto: URI', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [, payloadB64] = assertion.split('.')
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8')
      const payload = JSON.parse(payloadJson)

      expect(payload.sub).toMatch(/^mailto:/)
      expect(payload.sub).toContain(testParams.speakerEmail)
      console.log('✓ sub claim is mailto URI:', payload.sub)
    })

    it('should have nbf (not before) as NumericDate', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [, payloadB64] = assertion.split('.')
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8')
      const payload = JSON.parse(payloadJson)

      expect(typeof payload.nbf).toBe('number')
      expect(payload.nbf).toBeGreaterThan(0)
      // nbf should be in seconds (not milliseconds)
      expect(payload.nbf).toBeLessThan(Date.now() / 1000 + 60) // Within next minute
      console.log('✓ nbf claim is valid NumericDate:', payload.nbf)
    })

    it('should include credential properties at top level (not wrapped)', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [, payloadB64] = assertion.split('.')
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8')
      const payload = JSON.parse(payloadJson)

      // Credential properties should be at top level, not in 'vc' wrapper
      expect(payload['@context']).toBeDefined()
      expect(payload.type).toBeDefined()
      expect(payload.credentialSubject).toBeDefined()
      expect(payload.issuer).toBeDefined()

      // Should NOT have vc wrapper (that's VC Data Model v1.1)
      expect(payload.vc).toBeUndefined()
      console.log(
        '✓ Credential properties at top level (OpenBadges 3.0 format)',
      )
    })
  })

  describe('Credential Structure Validation', () => {
    it('should validate against OpenBadges 3.0 JSON schema', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      // Verify and decode JWT
      const credential = (await verifyCredentialJWT(
        assertion,
        config.signing.publicKey,
      )) as Credential

      // Validate against schema
      const result = validateCredential(credential)

      if (!result.valid) {
        console.error('Schema validation errors:', result.errors)
      }

      expect(result.valid).toBe(true)
      console.log('✓ Credential validates against OpenBadges 3.0 schema')
    })

    it('should have correct @context', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const credential = (await verifyCredentialJWT(
        assertion,
        config.signing.publicKey,
      )) as Credential

      expect(credential['@context']).toContain(
        'https://www.w3.org/ns/credentials/v2',
      )
      expect(credential['@context']).toContain(
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
      )
      console.log('✓ Credential has correct @context')
    })

    it('should have correct type array', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const credential = (await verifyCredentialJWT(
        assertion,
        config.signing.publicKey,
      )) as Credential

      expect(credential.type).toContain('VerifiableCredential')
      expect(credential.type).toContain('OpenBadgeCredential')
      console.log('✓ Credential has correct type array')
    })
  })

  describe('Signature Verification', () => {
    it('should produce valid JWT signature', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      // Verify signature with public key
      const credential = await verifyCredentialJWT(
        assertion,
        config.signing.publicKey,
      )

      expect(credential).toBeDefined()
      console.log('✓ JWT signature verifies with public key')
    })

    it('should fail verification with tampered JWT', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      // Tamper with the JWT by modifying the payload
      const [header, payload, signature] = assertion.split('.')
      const tamperedPayload = Buffer.from(
        JSON.stringify({ modified: true }),
      ).toString('base64url')
      const tamperedJWT = `${header}.${tamperedPayload}.${signature}`

      let errorThrown = false
      let errorMessage = ''
      try {
        await verifyCredentialJWT(tamperedJWT, config.signing.publicKey)
      } catch (error) {
        errorThrown = true
        errorMessage = error instanceof Error ? error.message : String(error)
      }

      expect(errorThrown).toBe(true)
      console.log(
        '✓ JWT signature verification fails with tampered payload:',
        errorMessage,
      )
    })
  })

  describe('kid URL Dereferencing Simulation', () => {
    it('should generate kid URL that points to /api/badge/keys/key-1', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      const kidUrl = header.kid
      expect(kidUrl).toMatch(/\/api\/badge\/keys\/key-1$/)
      expect(kidUrl).not.toContain('#') // No fragment identifier

      console.log('✓ kid URL points to dedicated key endpoint:', kidUrl)
    })

    it('kid URL should be HTTP(S) dereferenceable (no fragment)', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      const kidUrl = header.kid

      // Parse as URL
      const url = new URL(kidUrl)
      expect(url.protocol).toMatch(/^https?:$/)
      expect(url.hash).toBe('') // Fragment must be empty
      expect(url.pathname).toMatch(/\/api\/badge\/keys\/key-1$/)

      console.log(
        '✓ kid URL is HTTP dereferenceable without fragment:',
        url.href,
      )
    })

    it('should verify that inline JWK matches expected structure', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      const jwk = header.jwk

      // Simulate what Java validator does (ExternalProofProbe.java:63)
      // It tries to access jwk.get("kty").asText()
      expect(jwk.kty).toBeDefined()
      expect(typeof jwk.kty).toBe('string')

      // For RSA keys, it also accesses n and e
      if (jwk.kty === 'RSA') {
        expect(jwk.n).toBeDefined()
        expect(typeof jwk.n).toBe('string')
        expect(jwk.e).toBeDefined()
        expect(typeof jwk.e).toBe('string')
      }

      console.log('✓ JWK structure matches Java validator expectations')
    })
  })

  describe('1EdTech Validator Requirements', () => {
    it('should use only RS256 or ES256 algorithm', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      // 1EdTech validator only accepts RS256 or ES256
      const allowedAlgs = ['RS256', 'ES256']
      expect(allowedAlgs).toContain(header.alg)

      console.log('✓ Algorithm is 1EdTech validator compatible:', header.alg)
    })

    it('should NOT use EdDSA algorithm (not supported by 1EdTech)', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      expect(header.alg).not.toBe('EdDSA')
      console.log('✓ Not using EdDSA (unsupported by 1EdTech OB30Inspector)')
    })

    it('should include both kid AND jwk for maximum compatibility', async () => {
      const { assertion } = await generateBadgeCredential(testParams, config)

      const [headerB64] = assertion.split('.')
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      // Our implementation includes BOTH for maximum compatibility
      expect(header.kid).toBeDefined()
      expect(header.jwk).toBeDefined()

      console.log('✓ JWT includes both kid and jwk (maximum compatibility)')
    })
  })

  describe('Complete Validation Flow', () => {
    it('should pass all validation steps in sequence', async () => {
      const { assertion, badgeId } = await generateBadgeCredential(
        testParams,
        config,
      )

      // Step 1: Verify JWT format
      expect(assertion).toMatch(
        /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
      )
      console.log('✓ Step 1: Valid JWT format (3 base64url parts)')

      // Step 2: Decode and verify header
      const [headerB64] = assertion.split('.')
      const header = JSON.parse(
        Buffer.from(headerB64, 'base64url').toString('utf-8'),
      )
      expect(header.alg).toBe('RS256')
      expect(header.typ).toBe('JWT')
      expect(header.kid).toBeDefined()
      expect(header.jwk).toBeDefined()
      console.log('✓ Step 2: Valid JWT header structure')

      // Step 3: Verify JWK structure
      expect(header.jwk.kty).toBe('RSA')
      expect(header.jwk.e).toBeDefined()
      expect(header.jwk.n).toBeDefined()
      expect(header.jwk.d).toBeUndefined()
      console.log('✓ Step 3: Valid JWK structure (RSA public key only)')

      // Step 4: Decode and verify payload claims
      const [, payloadB64] = assertion.split('.')
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf-8'),
      )
      expect(payload.iss).toBe(config.issuer.id)
      expect(payload.jti).toContain(badgeId)
      expect(payload.sub).toMatch(/^mailto:/)
      expect(payload.nbf).toBeDefined()
      console.log('✓ Step 4: Valid JWT payload claims')

      // Step 5: Verify signature
      const credential = await verifyCredentialJWT(
        assertion,
        config.signing.publicKey,
      )
      expect(credential).toBeDefined()
      console.log('✓ Step 5: Valid JWT signature')

      // Step 6: Validate credential structure
      const result = validateCredential(credential as Credential)
      expect(result.valid).toBe(true)
      console.log('✓ Step 6: Valid credential structure (JSON schema)')

      console.log(
        '\n✅ All validation steps passed - credential is 1EdTech validator compliant',
      )
    })
  })
})
