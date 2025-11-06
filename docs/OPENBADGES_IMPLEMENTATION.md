# OpenBadges 3.0 Implementation

This document describes the OpenBadges 3.0 implementation for the Cloud Native Bergen website.

## Overview

The badge system issues **OpenBadges 3.0 compliant** digital credentials to speakers and organizers. These badges are:

- Cryptographically signed using Ed25519 signatures
- Verifiable using W3C Verifiable Credentials Data Model 2.0
- Portable across digital wallet platforms
- Embeddable in SVG images for sharing

## Specification Compliance

### OpenBadges 3.0 Requirements

Our implementation follows the official [1EdTech OpenBadges 3.0 specification](https://www.imsglobal.org/spec/ob/v3p0/):

✅ **Correct Context URLs**

- `https://www.w3.org/ns/credentials/v2`
- `https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json`

✅ **Proper Credential Types**

- `VerifiableCredential` (W3C standard)
- `AchievementCredential` (OpenBadges 3.0 type)

✅ **Valid Date Fields**

- Uses `validFrom` instead of deprecated `issuanceDate`

✅ **Data Integrity Proofs**

- Type: `DataIntegrityProof`
- Cryptosuite: `eddsa-rdfc-2022`
- Algorithm: Ed25519 signature scheme

✅ **Achievement Structure**

- Properly structured `Achievement` object
- Image as object with `id` and `type` fields (not string)
- Criteria with narrative description
- Type fields as arrays (e.g., `type: ['Achievement']`)

✅ **Schema Compliance**

- All badges validated against official OB 3.0 JSON schema
- Automatic validation on badge generation
- Type fields must be arrays (even for single values)
- Image and proof fields must be properly structured objects/arrays

## Architecture

### Core Modules

#### 1. Badge Generator (`/lib/badge/generator.ts`)

Generates OpenBadges 3.0 compliant JSON-LD credentials:

```typescript
const { assertion, badgeId } = await generateBadgeCredential(params, conference)
```

Creates:

- `Achievement` - defines what was accomplished
- `AchievementCredential` - verifiable credential asserting the achievement
- `DataIntegrityProof` - cryptographic signature

#### 2. Cryptography (`/lib/badge/crypto.ts`)

Handles Ed25519 key management and signing:

```typescript
const signature = await signBadgeData(assertion)
const isValid = await verifyBadgeSignature(data, signature)
```

Features:

- Ed25519 key pair generation
- Data signing with canonicalization (sorted JSON keys)
- Signature verification
- Verification method generation

#### 4. Badge Baking (`/lib/badge/baking.ts`)

Embeds badge credentials into SVG images:

```typescript
const bakedSvg = bakeBadge(svgContent, assertion, verificationUrl)
```

Implements OpenBadges 3.0 baking specification:

- Uses `xmlns:openbadges="https://purl.imsglobal.org/ob/v3p0"` namespace
- Embeds credential in `<openbadges:credential>` element with CDATA wrapper
- Places element immediately after opening `<svg>` tag
- Includes verification URL in element attributes

#### 5. Schema Validation (`/lib/badge/schema-validator.ts`)

Validates badges against OpenBadges 3.0 JSON schema:

```typescript
// Validate and get result
const result = validateBadgeSchema(assertion)
if (!result.valid) {
  console.error(result.errors)
}

// Assert valid (throws on error)
assertValidBadge(assertion)

// Get human-readable errors
const errors = getValidationErrors(assertion)
```

Features:

- Complete OpenBadges 3.0 AchievementCredential schema
- Validates required fields (context, type, credentialSubject, issuer, validFrom)
- Enforces array types for `type` fields
- Validates object structure for `image` and `proof`
- Automatic validation on badge generation
- AJV-based JSON Schema validation

#### 6. Sanity Integration (`/lib/badge/sanity.ts`)

Manages badge lifecycle in Sanity CMS:

- Creates badge records
- Uploads baked SVG assets
- Tracks email delivery status
- Queries badges by conference/speaker

## API Endpoints

### Public Endpoints

#### `GET /api/badge/[badgeId]/verify`

Returns the complete badge credential with verification status:

```json
{
  "@context": [...],
  "type": ["VerifiableCredential", "AchievementCredential"],
  "credentialSubject": {...},
  "proof": {...},
  "verified": true,
  "verificationStatus": {
    "valid": true,
    "signatureValid": true,
    "verifiedAt": "2025-11-06T..."
  }
}
```

#### `GET /api/badge/[badgeId]/json`

Returns the raw badge credential as JSON-LD:

- Content-Type: `application/ld+json`
- CORS enabled
- Immutable caching

#### `GET /api/badge/[badgeId]/image`

Returns the badge SVG image:

- Content-Type: `image/svg+xml`
- Immutable caching

#### `GET /api/badge/[badgeId]/download`

Downloads the baked SVG with embedded credential:

- Content-Disposition: attachment
- Filename: `badge-{speaker}-{badgeId}.svg`

#### `GET /api/badge/.well-known/jwks.json`

Returns the public key set for signature verification:

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "base64url-encoded-public-key",
      "kid": "key-id",
      "use": "sig",
      "alg": "EdDSA"
    }
  ]
}
```

### Admin Endpoints (tRPC)

#### `badge.issue`

Issues a single badge to a speaker:

```typescript
await trpc.badge.issue.mutate({
  speakerId: 'speaker-id',
  conferenceId: 'conf-id',
  badgeType: 'speaker',
  sendEmail: true,
})
```

#### `badge.bulkIssue`

Issues badges to multiple speakers:

```typescript
await trpc.badge.bulkIssue.mutate({
  speakerIds: ['id1', 'id2', 'id3'],
  conferenceId: 'conf-id',
  badgeType: 'speaker',
})
```

#### `badge.list`

Lists badges for a conference or speaker:

```typescript
const badges = await trpc.badge.list.query({ conferenceId: 'conf-id' })
```

#### `badge.verify`

Verifies a badge signature (admin):

```typescript
const result = await trpc.badge.verify.query({ badgeId: 'badge-123' })
```

## Badge Credential Structure

### Example Credential

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
  ],
  "id": "https://cloudnativebergen.no/api/badge/badge-xyz/",
  "type": ["VerifiableCredential", "AchievementCredential"],
  "name": "Speaker Badge for Cloud Native Day Bergen 2025",
  "credentialSubject": {
    "id": "mailto:speaker@example.com",
    "type": "AchievementSubject",
    "achievement": {
      "@context": [...],
      "id": "https://cloudnativebergen.no/api/badge/badge-xyz/achievement",
      "type": ["Achievement"],
      "name": "Speaker at Cloud Native Day Bergen 2025",
      "description": "This badge recognizes ...",
      "image": {
        "id": "https://cloudnativebergen.no/api/badge/badge-xyz/image",
        "type": "Image"
      },
      "criteria": {
        "narrative": "Presented a talk or workshop..."
      },
      "issuer": {
        "id": "https://cloudnativebergen.no",
        "type": "Profile",
        "name": "Cloud Native Bergen",
        "url": "https://cloudnativebergen.no",
        "email": "contact@cloudnativebergen.no"
      }
    }
  },
  "issuer": {
    "id": "https://cloudnativebergen.no",
    "type": "Profile",
    "name": "Cloud Native Bergen",
    "url": "https://cloudnativebergen.no"
  },
  "validFrom": "2025-11-06T14:30:00Z",
  "proof": {
    "type": "DataIntegrityProof",
    "created": "2025-11-06T14:30:00Z",
    "verificationMethod": "https://cloudnativebergen.no#key-a1b2c3d4",
    "cryptosuite": "eddsa-rdfc-2022",
    "proofPurpose": "assertionMethod",
    "proofValue": "base64-encoded-signature"
  }
}
```

## Security

### Key Management

Ed25519 key pairs are generated using `@noble/ed25519`:

```bash
npx tsx scripts/generate-badge-keys.ts
```

Keys must be stored in environment variables:

- `BADGE_ISSUER_PRIVATE_KEY` - Keep secret!
- `BADGE_ISSUER_PUBLIC_KEY` - Used for verification
- `BADGE_ISSUER_URL` - Your production domain

### Signature Verification

Signatures are verified using:

1. Canonical JSON (sorted keys)
2. UTF-8 encoding
3. Ed25519 signature verification
4. Public key from environment

Verification flow:

```typescript
const { proof, ...credential } = badgeAssertion
const canonicalJson = JSON.stringify(credential, Object.keys(credential).sort())
const isValid = await verifyBadgeSignature(credential, proof.proofValue)
```

## Multi-Tenant Support

The badge system is fully multi-tenant:

### Dynamic Configuration

Each conference can have its own:

- **Contact Email**: `conference.contact_email`
- **Domain**: `conference.domains[0]`
- **Organization Name**: `conference.organizer`

### Email Addresses

Badge emails are sent from:

```typescript
const fromEmail = conference.contact_email
  ? `${conference.organizer} <${conference.contact_email}>`
  : `${conference.organizer} <noreply@${conference.domains[0]}>`
```

Fallback: `noreply@cloudnativebergen.no`

## Testing

Comprehensive test suite validates OpenBadges 3.0 compliance:

```bash
# Run all badge tests
npm run test:badges

# Run specific test suites
npm test -- openbadges-compliance
npm test -- schema-validator
```

### Test Coverage

**OpenBadges Compliance Tests** (`openbadges-compliance.test.ts`):

- ✅ OpenBadges 3.0 credential structure
- ✅ Context URLs and types (as arrays)
- ✅ Date field naming (validFrom vs issuanceDate)
- ✅ Proof structure (DataIntegrityProof array)
- ✅ Cryptographic signing and verification
- ✅ Badge baking with xmlns:openbadges format
- ✅ Achievement structure with image objects
- ✅ Multi-tenant email configuration

**Schema Validation Tests** (`schema-validator.test.ts`):

- ✅ Valid badge passes schema validation
- ✅ Detects missing required fields (@context, type, credentialSubject, issuer, validFrom)
- ✅ Validates type fields must be arrays
- ✅ Validates image fields must be objects with id/type
- ✅ Validates proof must be array of DataIntegrityProof objects
- ✅ Provides human-readable error messages
- ✅ assertValidBadge throws on validation errors

### Validation Integration

All generated badges are automatically validated:

```typescript
// In generator.ts
const { assertion } = await generateBadgeCredential(params, conference)
// Validation happens automatically before return
// Throws error if badge doesn't match OB 3.0 schema
```

## Integration

### Issuing Badges

Admin interface at `/admin/speakers/badge`:

1. Select badge type (Speaker/Organizer)
2. Search and select speakers
3. Preview badge design
4. Issue badges (automatically sent via email)

### Badge Display

Recipients receive:

- Email with download link
- Baked SVG file (contains embedded credential)
- Verification URL for validators

### Verification

Anyone can verify a badge:

1. Visit `/api/badge/{badgeId}/verify`
2. Check `verificationStatus.signatureValid`
3. Verify issuer details
4. Validate achievement criteria

## Compatibility

### Digital Wallets

Badges are compatible with:

- Credly
- Badgr
- LinkedIn (via badge import)
- Any W3C VC Data Model 2.0 wallet

### Standards Support

- ✅ W3C Verifiable Credentials Data Model 2.0
- ✅ OpenBadges 3.0 (credential structure and baking)
- ✅ Data Integrity Proofs (eddsa-rdfc-2022)
- ✅ OpenBadges 2.0 extraction (backward compatibility)
- ✅ JSON-LD
- ✅ Ed25519 signatures (RFC 8032)

## References

- [OpenBadges 3.0 Specification](https://www.imsglobal.org/spec/ob/v3p0/)
- [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/)
- [Data Integrity Proofs](https://www.w3.org/TR/vc-data-integrity/)
- [Ed25519 Signature Algorithm](https://datatracker.ietf.org/doc/html/rfc8032)
- [OpenBadges Baking Specification](https://www.imsglobal.org/sites/default/files/Badges/OBv2p0Final/baking/)
