# @cloudnativebergen/openbadges

A TypeScript library for creating, signing, and verifying [OpenBadges 3.0](https://www.imsglobal.org/spec/ob/v3p0/) compliant digital credentials.

## Features

- ✅ **OpenBadges 3.0 Compliant**: Strict adherence to the 1EdTech OpenBadges 3.0 specification
- 🔐 **Ed25519 Signatures**: Cryptographic signing using Ed25519 with Data Integrity Proofs
- 🎨 **SVG Badge Baking**: Embed credentials directly into SVG images
- ✨ **Type-Safe**: Full TypeScript support with comprehensive type definitions
- 🚀 **Fail-Fast Validation**: Immediate error feedback with detailed context
- 📦 **Zero Dependencies**: Core logic with minimal peer dependencies

## Installation

```bash
npm install @cloudnativebergen/openbadges
```

### Peer Dependencies

```bash
npm install @noble/ed25519 ajv ajv-formats bs58
```

## Quick Start

```typescript
import {
  createCredential,
  signCredential,
  bakeBadge,
  extractBadge,
  verifyCredential,
  validateCredential,
} from '@cloudnativebergen/openbadges'

// 1. Create a credential
const credential = createCredential({
  issuer: {
    id: 'https://example.org/api/badge/issuer',
    name: 'Example Organization',
    url: 'https://example.org',
    email: 'contact@example.org',
    description: 'Example organization issuing badges',
  },
  subject: {
    id: 'mailto:recipient@example.com',
    type: ['AchievementSubject'],
  },
  achievement: {
    id: 'https://example.org/api/badge/badge-123/achievement',
    name: 'Example Achievement',
    description: 'Awarded for completing example tasks',
    criteria: {
      narrative: 'Complete all example tasks successfully',
    },
    image: {
      id: 'https://example.org/api/badge/badge-123/image',
      type: 'Image',
    },
  },
  credentialId: 'https://example.org/api/badge/badge-123',
  validFrom: new Date().toISOString(),
})

// 2. Sign the credential
const signedCredential = await signCredential(credential, {
  privateKey: 'your-ed25519-private-key-hex',
  publicKey: 'your-ed25519-public-key-hex',
  verificationMethod: 'https://example.org/api/badge/keys/key-abc123',
})

// 3. Validate against OpenBadges 3.0 schema
const validation = validateCredential(signedCredential)
if (!validation.valid) {
  console.error('Validation errors:', validation.errors)
}

// 4. Bake into SVG
const svgContent = '<svg>...</svg>'
const bakedSvg = bakeBadge(svgContent, signedCredential)

// 5. Extract from SVG
const extracted = extractBadge(bakedSvg)

// 6. Verify signature
const isValid = await verifyCredential(extracted, 'your-ed25519-public-key-hex')
```

## API Reference

### Credential Creation

#### `createCredential(config: CredentialConfig): Credential`

Creates an unsigned OpenBadges 3.0 credential.

### Cryptographic Operations

#### `signCredential(credential: Credential, config: SigningConfig): Promise<SignedCredential>`

Signs a credential using Ed25519 with Data Integrity Proof.

#### `verifyCredential(credential: SignedCredential, publicKey: string): Promise<boolean>`

Verifies the cryptographic signature of a credential.

### Badge Baking

#### `bakeBadge(svg: string, credential: SignedCredential): string`

Embeds a signed credential into an SVG image.

#### `extractBadge(svg: string): SignedCredential`

Extracts a credential from a baked SVG image.

### Validation

#### `validateCredential(credential: Credential): ValidationResult`

Validates a credential against the OpenBadges 3.0 JSON schema.

### Output Generators

Functions for generating API endpoint responses:

- `generateCredentialResponse(credential): object`
- `generateVerificationResponse(credential, verified, error?): object`
- `generateIssuerProfile(config, verificationMethods): object`
- `generateMultikeyDocument(publicKey, keyId, controller): object`
- `generateAchievementResponse(achievement): object`

## Error Handling

The library uses fail-fast validation with descriptive error messages:

```typescript
import { OpenBadgesError, ERROR_CODES } from '@cloudnativebergen/openbadges'

try {
  const credential = createCredential(config)
} catch (error) {
  if (error instanceof OpenBadgesError) {
    console.error(`Error ${error.code}: ${error.message}`)
    console.error('Context:', error.context)
  }
}
```

## License

MIT © Cloud Native Bergen
