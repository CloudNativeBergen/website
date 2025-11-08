# OpenBadges 3.0 Library

A modern, production-ready TypeScript implementation of the OpenBadges 3.0 specification for issuing verifiable digital credentials.

## Overview

This library provides a complete toolkit for creating, signing, verifying, and managing OpenBadges 3.0 compliant credentials. Built with type safety, security, and interoperability as core principles.

## Features

- **JWT Proof Format**: RS256 (RSA) and EdDSA (Ed25519) signature algorithms
- **Type Safety**: Full TypeScript support with comprehensive types
- **Spec Compliant**: Implements W3C Verifiable Credentials Data Model 2.0 and OpenBadges 3.0
- **Badge Baking**: Embed and extract credentials from SVG images
- **Validation**: JSON schema validation and cryptographic verification
- **Key Management**: Support for DID:key and HTTP(S) verification methods
- **Error Handling**: Detailed error classes with context

## Quick Start

### Creating a Credential

```typescript
import { createCredential, signCredentialJWT } from '@/lib/openbadges'

const credential = createCredential({
  credentialId: 'https://example.com/credentials/123',
  name: 'Achievement Badge',
  subject: {
    id: 'mailto:recipient@example.com',
    type: ['AchievementSubject'],
  },
  achievement: {
    id: 'https://example.com/achievements/speaking',
    name: 'Conference Speaker',
    description: 'Presented at our annual conference',
    criteria: {
      narrative: 'Delivered a talk to the community',
    },
  },
  issuer: {
    id: 'https://example.com',
    name: 'Example Organization',
    url: 'https://example.com',
  },
  validFrom: new Date().toISOString(),
})

// Sign with RS256 (recommended)
const jwt = await signCredentialJWT(credential, {
  privateKey: rsaPrivateKeyPEM,
  publicKey: rsaPublicKeyPEM,
  verificationMethod: 'https://example.com/issuer#key-1',
})
```

### Verifying a Credential

```typescript
import { verifyCredentialJWT, validateCredential } from '@/lib/openbadges'

// Verify JWT signature and extract credential
const credential = await verifyCredentialJWT(jwt, publicKeyPEM)

// Validate credential structure
const result = validateCredential(credential)
if (!result.valid) {
  console.error('Validation errors:', result.errors)
}
```

### Baking Badges

```typescript
import { bakeBadge, extractBadge } from '@/lib/openbadges'

// Embed credential in SVG
const bakedSvg = bakeBadge(svgContent, jwt)

// Extract credential from SVG
const extractedCredential = extractBadge(bakedSvg)
```

## Architecture

### Core Modules

- **credential.ts** - Create unsigned credentials
- **crypto.ts** - Sign and verify credentials (JWT and Data Integrity Proofs)
- **validator.ts** - JSON schema validation
- **baking.ts** - Embed/extract credentials in SVG images
- **keys.ts** - Key format conversions (DID:key, JWK, Multikey)
- **encoding.ts** - Hex, base58, and multibase encoding utilities
- **types.ts** - TypeScript type definitions
- **errors.ts** - Error classes with detailed context

### Key Formats Supported

- **RSA Keys**: PEM format (PKCS#8 private, SPKI public) - RS256 algorithm
- **Ed25519 Keys**: Hex strings (64 chars) - EdDSA algorithm
- **DID:key**: Decentralized identifier format with multibase encoding
- **JWK**: JSON Web Key format for JWKS endpoints

## Environment Variables

```bash
# RSA Keys (Recommended - OpenBadges 3.0 compliant)
BADGE_ISSUER_RSA_PRIVATE_KEY=<PEM format>
BADGE_ISSUER_RSA_PUBLIC_KEY=<PEM format>

# Ed25519 Keys (Legacy support)
BADGE_ISSUER_PRIVATE_KEY=<64-char hex>
BADGE_ISSUER_PUBLIC_KEY=<64-char hex>
```

## API Routes

The library is used by several API endpoints:

- **`/api/badge/issuer`** - Issuer profile with public keys
- **`/api/badge/[id]/json`** - Credential data (JWT or JSON-LD)
- **`/api/badge/[id]/verify`** - Verify signature and validate structure
- **`/api/badge/[id]/achievement`** - Extract achievement definition
- **`/api/badge/.well-known/jwks.json`** - Public key set (JWKS)
- **`/api/badge/validate`** - Comprehensive validation tool

## Error Handling

```typescript
import {
  SigningError,
  VerificationError,
  ValidationError,
  ConfigurationError,
} from '@/lib/openbadges'

try {
  const jwt = await signCredentialJWT(credential, config)
} catch (error) {
  if (error instanceof SigningError) {
    console.error('Signing failed:', error.message, error.context)
  } else if (error instanceof ConfigurationError) {
    console.error('Invalid config:', error.message)
  }
}
```

## Testing

The library includes comprehensive test coverage for all core functionality. Run tests with:

```bash
npm test
```

## References

- [OpenBadges 3.0 Specification](https://www.imsglobal.org/spec/ob/v3p0/)
- [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/)
- [W3C Data Integrity](https://www.w3.org/TR/vc-data-integrity/)
- [RFC 7515 - JSON Web Signature (JWS)](https://datatracker.ietf.org/doc/html/rfc7515)
- [RFC 7519 - JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519)

## License

MIT
