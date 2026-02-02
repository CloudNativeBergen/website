# OpenBadges 3.0 Implementation

This document provides a high-level architectural overview of the OpenBadges 3.0 implementation for the Cloud Native Days Norway website.

## Overview

The badge system issues **OpenBadges 3.0 compliant** digital credentials to speakers and organizers. These badges are:

- **Cryptographically signed** using RS256 (RSA) or EdDSA (Ed25519) algorithms
- **JWT-based** with dereferenceable public keys for external validator compatibility
- **Verifiable** using W3C Verifiable Credentials Data Model 2.0
- **Portable** across digital wallet platforms (Credly, Badgr, LinkedIn)
- **Embeddable** in SVG images with "baked" credentials
- **Multi-tenant** supporting multiple conferences with independent configurations

## Architecture

### High-Level Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                     Admin Interface                          │
│  /admin/speakers/badge - Issue badges via UI                │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                   Badge Generation Layer                     │
│  /lib/badge/generator.ts - Orchestrates badge creation      │
│  /server/routers/badge.ts - tRPC endpoints                  │
└────────────┬────────────────────────────────────────────────┘
             │
             ├──────────────┬─────────────────┬────────────────┐
             ▼              ▼                 ▼                ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  OpenBadges Lib  │ │  Badge SVG   │ │ Email System │ │   Storage    │
│ /lib/openbadges/ │ │  Generator   │ │  /lib/email  │ │    Sanity    │
└──────────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                   Public API Endpoints                       │
│  /api/badge/[id]/json    - Credential JSON-LD              │
│  /api/badge/[id]/verify  - Verification with proof check   │
│  /api/badge/[id]/image   - SVG image                       │
│  /api/badge/[id]/download - Baked SVG download            │
│  /api/badge/issuer       - DID issuer profile             │
│  /api/badge/validate     - Admin validation tool          │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. OpenBadges Library (`/lib/openbadges/`)

**Purpose:** Reusable TypeScript library implementing OpenBadges 3.0 specification.

**Key Modules:**

- **`credential.ts`** - Create unsigned credentials with validation
- **`crypto.ts`** - JWT signing and verification (RS256/EdDSA), JWK conversion
- **`keys.ts`** - DID key management (generation, conversion, extraction)
- **`baking.ts`** - Embed/extract credentials in SVG files (supports JWT format)
- **`validator.ts`** - JSON schema validation against OB 3.0 spec
- **`errors.ts`** - Typed error handling

**Export:** Single entry point via `/lib/openbadges/index.ts`

**Documentation:** `/lib/openbadges/README.md`

---

#### 2. Badge Generator (`/lib/badge/`)

**Purpose:** Application-specific badge generation using OpenBadges library.

**Key Files:**

- **`generator.ts`** - `generateBadgeCredential()` - orchestrates credential creation
- **`svg.ts`** - `generateBadgeSVG()` - creates visual badge design
- **`types.ts`** - Type definitions for badge parameters

**Responsibilities:**

- Constructs achievement definitions
- Generates evidence URLs (speaker profiles, talk references)
- Creates issuer profiles with conference data
- Signs credentials with environment keys
- Returns baked SVG with embedded credential

---

#### 3. tRPC Badge Router (`/server/routers/badge.ts`)

**Purpose:** Server-side API for badge operations.

**Endpoints:**

- **`badge.issue`** - Issue single badge to speaker
- **`badge.bulkIssue`** - Issue badges to multiple speakers
- **`badge.list`** - List badges for conference/speaker
- **`badge.verify`** - Verify badge signature (admin)

**Features:**

- Conference-aware (multi-tenant)
- Automatic email sending via Resend
- Sanity CMS integration for speaker/conference data
- Error handling and validation

---

#### 4. Public API Endpoints (`/app/api/badge/`)

**Purpose:** Public REST endpoints for badge access and verification.

**Key Routes:**

| Endpoint                          | Purpose                            | Content Type          |
| --------------------------------- | ---------------------------------- | --------------------- |
| `GET /api/badge/issuer`           | Issuer profile with JWK public key | `application/ld+json` |
| `GET /api/badge/[id]/json`        | Raw credential JSON-LD             | `application/ld+json` |
| `GET /api/badge/[id]/verify`      | Credential + verification status   | `application/json`    |
| `GET /api/badge/[id]/image`       | Badge SVG visual                   | `image/svg+xml`       |
| `GET /api/badge/[id]/download`    | Baked SVG download                 | `image/svg+xml`       |
| `GET /api/badge/[id]/achievement` | Achievement definition             | `application/ld+json` |
| `POST /api/badge/validate`        | Admin validation tool              | `application/json`    |

---

#### 5. Badge Validator (`/app/api/badge/validate/route.ts`)

**Purpose:** Comprehensive server-side badge verification for admin UI.

**Admin Interface:** `/components/admin/BadgeValidator.tsx`

**Validation Checks:**

1. **Extraction** - Extract credential from baked SVG
2. **Structure** - OpenBadges 3.0 schema compliance
3. **Issuer** - Validate issuer (supports both did:key and HTTP(S))
4. **Proof** - Cryptographic signature verification
5. **URL Format** - Check evidence and issuer URLs
6. **Temporal Validity** - Validate date ranges

**Cryptographic Verification:**

- Extracts public key from `did:key` URI
- Verifies Ed25519 signature using `verifyCredential()`
- Returns `signatureValid: true/false` in results

---

#### 6. Admin UI (`/components/admin/` & `/app/admin/`)

**Badge Management:**

- **`/admin/speakers/badge`** - Issue badges to speakers
  - Speaker selection
  - Badge type (Speaker/Organizer)
  - Bulk issuance
  - Email preview

**Validation Tools:**

- **`BadgeValidator.tsx`** - Upload and verify baked SVG badges
  - Visual preview
  - Comprehensive validation checks
  - Cryptographic verification
  - Detailed error reporting

---

## Badge Credential Structure

### Key Features

**Identity Management:**

- **Issuer ID:** `https://domain.com` (HTTP issuer for RS256) or `did:key:z6Mkg51...` (DID for EdDSA)
- **Subject ID:** `mailto:speaker@example.com` (email-based recipient identity)
- **Verification Method:** `{baseUrl}/api/badge/issuer#key-1` (RS256) or `did:key:...#...` (EdDSA)

**URLs:**

- **Credential ID:** `https://domain.com/api/badge/{uuid}`
- **Achievement ID:** `https://domain.com/api/badge/{uuid}/achievement`
- **Image ID:** `https://domain.com/api/badge/{uuid}/image`
- **Issuer URL:** `https://domain.com` (organization homepage)
- **Evidence:** `https://domain.com/speaker/{slug}`, `https://domain.com/program#talk-{id}`

**JWT Proof (RS256):**

- **Type:** JWT Compact Serialization
- **Algorithm:** RS256 (RSA with SHA-256)
- **Header:** `alg: "RS256"`, `typ: "JWT"`, `kid: "{baseUrl}/api/badge/issuer#key-1"`
- **Claims:** `iss`, `jti`, `sub`, `nbf`, `exp`, `vc` (full credential)

**Data Integrity Proof (EdDSA - Legacy):**

- **Type:** `DataIntegrityProof`
- **Cryptosuite:** `eddsa-rdfc-2022` (Ed25519 signatures)
- **Proof Purpose:** `assertionMethod`

See example credential in `/lib/openbadges/README.md`

---

## Security & Key Management

### Key Generation

**RSA Keys (Recommended - OpenBadges 3.0 Compliant):**

```bash
npx tsx scripts/generate-rsa-keys.ts
```

**Ed25519 Keys (Legacy Support):**

```bash
npx tsx scripts/generate-badge-keys.ts
```

### Environment Variables

**RSA Keys (Recommended):**

- `BADGE_ISSUER_RSA_PRIVATE_KEY` - PEM-encoded RSA private key (keep secret!)
- `BADGE_ISSUER_RSA_PUBLIC_KEY` - PEM-encoded RSA public key

**Ed25519 Keys (Fallback):**

- `BADGE_ISSUER_PRIVATE_KEY` - Hex-encoded Ed25519 private key
- `BADGE_ISSUER_PUBLIC_KEY` - Hex-encoded Ed25519 public key

**Key Storage:**

- Store in `.env.local` for development
- Use Vercel environment variables for production
- Never commit private keys to version control
- System prefers RSA keys when both types are present

### Cryptographic Signing

The system supports two signing methods:

#### JWT Proof Format (RS256 - Default)

- **Algorithm:** RS256 (RSA with SHA-256) per OpenBadges 3.0 spec section 8.2.3
- **Key Reference:** `kid` header points to `{baseUrl}/api/badge/issuer#key-1`
- **Public Key:** Exposed as JWK at issuer endpoint
- **Format:** Compact JWS (header.payload.signature)
- **Verification:** External validators can dereference public key from issuer endpoint
- **Baking:** JWT embedded in SVG using `<openbadges:credential verify="{jwt}">`

#### Data Integrity Proof (EdDSA - Legacy)

- **Cryptosuite:** `eddsa-rdfc-2022` with Ed25519 signatures
- **Identity:** `did:key` for self-sovereign, portable verification
- **Process:** RDF Dataset Canonicalization (URDNA2015) + Ed25519 signature
- **Verification:** Offline verification, no HTTP endpoint required
- **Baking:** Credential embedded in SVG with CDATA wrapper

The JWT format with RS256 is recommended for maximum compatibility with external OpenBadges 3.0 validators and digital wallet platforms.

---

## Multi-Tenant Support

### Conference-Specific Configuration

Each conference can have:

- **Custom domains:** `conference.domains[]`
- **Organization name:** `conference.organizer`
- **Contact email:** `conference.contact_email`
- **Branding:** Conference-specific badge designs

### Dynamic Email Configuration

Badges are sent from conference-specific addresses:

- Format: `{organizer} <{contact_email}>`
- Fallback: `{organizer} <noreply@{domain}>`
- Default: `noreply@cloudnativedays.no`

---

## Testing & Validation

### Test Suites

**Badge E2E Tests** (`__tests__/api/badge/badge-e2e.test.ts`)

- Complete badge lifecycle (generation → signing → baking → extraction → verification)
- Evidence URL validation
- Issuer URL format validation
- Cryptographic signature verification via validator API

**OpenBadges Tests** (`__tests__/lib/openbadges/`)

- Credential creation and validation
- Signature verification
- DID key utilities
- Badge baking/extraction
- Controller validation (did:key and HTTP(S))

**Commands:**

```bash
pnpm test badge-e2e.test.ts        # Full badge lifecycle
pnpm test openbadges.test.ts       # OpenBadges library
pnpm test controller-validation    # DID/HTTP controller tests
```

### Validation Integration

All badges are automatically validated against OpenBadges 3.0 schema during generation. Invalid badges throw errors before being issued.

---

### Specification Compliance

#### OpenBadges 3.0 ✅

- W3C Verifiable Credentials Data Model 2.0
- Proper context URLs and credential types
- `validFrom` (not deprecated `issuanceDate`)
- Data Integrity Proofs with `eddsa-rdfc-2022`
- Achievement structure with proper image objects
- Type fields as arrays (per JSON-LD spec)

### Digital Wallet Compatibility

Compatible with:

- **Credly** - Import via JSON-LD
- **Badgr** - OpenBadges 3.0 support
- **LinkedIn** - Badge import feature
- Any W3C Verifiable Credentials wallet

---

## References

### Specifications

- [OpenBadges 3.0](https://www.imsglobal.org/spec/ob/v3p0/)
- [W3C Verifiable Credentials 2.0](https://www.w3.org/TR/vc-data-model-2.0/)
- [Data Integrity Proofs](https://www.w3.org/TR/vc-data-integrity/)
- [DID:key Method Spec](https://w3c-ccg.github.io/did-method-key/)
- [Ed25519 (RFC 8032)](https://datatracker.ietf.org/doc/html/rfc8032)

### Implementation Docs

- `/lib/openbadges/README.md` - Library documentation with usage examples
- `/docs/EMAIL_SYSTEM.md` - Email notification system
- `/docs/ADMIN_NOTIFICATION_SYSTEM.md` - Admin event handling
