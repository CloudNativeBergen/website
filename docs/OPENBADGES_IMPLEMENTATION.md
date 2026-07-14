# OpenBadges 3.0 Implementation

This document provides a high-level architectural overview of the OpenBadges 3.0 implementation for the Cloud Native Days Norway website.

## Overview

The badge system issues **OpenBadges 3.0 compliant** digital credentials to speakers and organizers. Every badge is signed in **two formats**:

1. **Embedded Data Integrity Proof (primary)** — JSON-LD credential with an
   `eddsa-rdfc-2022` proof, signed with the Digital Bazaar reference stack
   (`@digitalbazaar/vc`). This is what certified OB 3.0 displayers such as
   **Credly** verify, and it is the format baked into the SVG and stored in
   the `badgeJson` field.
2. **RS256 JWT (secondary)** — Compact JWS for the 1EdTech OB30Inspector
   validator, stored in the `badgeJwt` field and served from
   `/api/badge/[id]/jwt`.

The badges are:

- **Cryptographically signed** using Ed25519 (embedded proof) and RS256 (JWT)
- **Verifiable** using W3C Verifiable Credentials Data Model 2.0
- **Portable** across digital wallet platforms (Credly, Badgr, LinkedIn)
- **Embeddable** in SVG images with "baked" credentials
- **Multi-tenant** supporting multiple conferences with independent configurations

**What to give Credly:** either the baked SVG (downloaded from
`/api/badge/[id]/download`) or the JSON credential from
`/api/badge/[id]/json` — both contain the embedded Data Integrity Proof.

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
│  badge.validate (tRPC)   - Admin validation tool          │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. OpenBadges Library (`/lib/openbadges/`)

**Purpose:** Reusable TypeScript library implementing OpenBadges 3.0 specification.

**Key Modules:**

- **`credential.ts`** - Create unsigned credentials with validation (evidence
  at the credential top level, mailto: recipients lowercased)
- **`crypto.ts`** - Embedded Data Integrity Proof signing/verification
  (eddsa-rdfc-2022 via the Digital Bazaar stack with an offline document
  loader) plus JWT signing and verification (RS256/EdDSA), JWK conversion
- **`keys.ts`** - DID key management (generation, conversion, extraction)
- **`baking.ts`** - Embed/extract credentials in SVG files (JSON-LD CDATA for
  embedded proofs, `verify` attribute for JWT)
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

- **`badge.admin.issue`** - Issue single badge to speaker
- **`badge.admin.bulkIssue`** - Issue badges to multiple speakers
- **`badge.admin.list`** - List badges for conference/speaker
- **`badge.verify`** - Verify badge signature (public)

**Features:**

- Conference-aware (multi-tenant)
- Automatic email sending via Resend
- Sanity CMS integration for speaker/conference data
- Error handling and validation

---

#### 4. Public API Endpoints (`/app/api/badge/`)

**Purpose:** Public REST endpoints for badge access and verification.

**Key Routes:**

| Endpoint                          | Purpose                                                        | Content Type          |
| --------------------------------- | -------------------------------------------------------------- | --------------------- |
| `GET /api/badge/issuer`           | Issuer profile with RSA JWK + Ed25519 Multikey                 | `application/ld+json` |
| `GET /api/badge/[id]/json`        | Embedded-proof credential JSON (legacy badges: JWT text/plain) | `application/json`    |
| `GET /api/badge/[id]/jwt`         | RS256 JWT credential (404 when absent)                         | `text/plain`          |
| `GET /api/badge/[id]/verify`      | Credential + verification status                               | `application/json`    |
| `GET /api/badge/[id]/image`       | Badge SVG visual                                               | `image/svg+xml`       |
| `GET /api/badge/[id]/download`    | Baked SVG download                                             | `image/svg+xml`       |
| `GET /api/badge/[id]/achievement` | Achievement definition                                         | `application/ld+json` |
| `badge.validate` (tRPC)           | Admin validation tool                                          | `application/json`    |

---

#### 5. Badge Validator (`badge.validate` tRPC mutation)

**Purpose:** Comprehensive server-side badge verification for admin UI.

**Router:** `/server/routers/badge.ts` · **Validation Logic:** `/lib/badge/validation.ts`

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

- **Issuer ID:** `{baseUrl}/api/badge/issuer` (dereferenceable issuer profile)
- **Subject ID:** `mailto:speaker@example.com` (email-based recipient
  identity, always lowercased — Credly matches recipients by a
  case-sensitive email hash)
- **Verification Method:** `{baseUrl}/api/badge/issuer#key-ed25519`
  (embedded proof) and `{baseUrl}/api/badge/keys/key-1` (JWT `kid`)

**URLs:**

- **Credential ID:** `https://domain.com/api/badge/{uuid}`
- **Achievement ID:** `https://domain.com/api/badge/{uuid}/achievement`
- **Image ID:** `https://domain.com/api/badge/{uuid}/image`
- **Issuer URL:** `https://domain.com` (organization homepage)
- **Evidence:** `https://domain.com/speaker/{slug}`, `https://domain.com/program#talk-{id}`
  — evidence is placed at the **credential top level** per VC 2.0 / OB 3.0
  (the OB context rejects evidence nested under achievement)

**Data Integrity Proof (Ed25519 - Primary):**

- **Type:** `DataIntegrityProof`
- **Cryptosuite:** `eddsa-rdfc-2022` (Ed25519 signatures)
- **Proof Purpose:** `assertionMethod`
- **Verification Method:** `{baseUrl}/api/badge/issuer#key-ed25519` —
  verifiers strip the fragment and fetch the issuer profile, which lists the
  key in its `verificationMethod` array with `controller` = issuer id

**JWT Proof (RS256 - Secondary):**

- **Type:** JWT Compact Serialization
- **Algorithm:** RS256 (RSA with SHA-256)
- **Header:** `alg: "RS256"`, `typ: "JWT"`, `kid: "{baseUrl}/api/badge/keys/key-1"`
- **Claims:** `iss`, `jti`, `sub`, `nbf`, `exp` + credential at top level

See example credential in `/lib/openbadges/README.md`

**Historical note (pre-2026 embedded proofs):** the original hand-rolled
`signCredential` implementation was broken four ways — it signed the
unhashed, reversed concatenation of the canonical documents instead of
`sha256(proofOptions) || sha256(document)`, canonicalized against fake stub
contexts that silently dropped most RDF quads, canonicalized the proof
options with the wrong context, and masked all of this by canonicalizing
with `safe: false`. Those proofs never verified outside this codebase. The
implementation was replaced with the Digital Bazaar reference stack; all
production badges issued before the switch store a JWT in `badgeJson`
(handled by the legacy code paths), so no data migration is required.

---

## Security & Key Management

### Key Generation

**Ed25519 seed (embedded Data Integrity Proofs — required):**

```bash
pnpm tsx scripts/generate-badge-ed25519-key.ts
# or: pnpm generate-badge-ed25519-key
```

Prints a random 32-byte seed (64 hex characters) plus the derived
`publicKeyMultibase` (as `BADGE_ISSUER_ED25519_PUBLIC_KEY`) and `did:key`.
The seed IS the private key and is used for issuance/signing; the multibase
public key is used for verification and is also served from the issuer
profile. Configure both variables.

**RSA Keys (JWT format — required):**

```bash
npx tsx scripts/generate-rsa-keys.ts
```

### Environment Variables

Issuance and verification use different keys. A verify-only / preview
environment needs only the public (verification) variables — never the secret
Ed25519 seed.

**Issuance (signing) — secret:**

- `BADGE_ISSUER_RSA_PRIVATE_KEY` - PEM-encoded RSA private key (keep secret!)
- `BADGE_ISSUER_ED25519_SEED` - 32-byte Ed25519 seed as 64 hex characters
  (keep secret! — generate with `pnpm generate-badge-ed25519-key`)

**Verification — safe to expose:**

- `BADGE_ISSUER_RSA_PUBLIC_KEY` - PEM-encoded RSA public key (also required at
  issuance to embed the JWK)
- `BADGE_ISSUER_ED25519_PUBLIC_KEY` - Ed25519 public key as multibase (`z...`),
  derived from the seed. Used by the verify routes; the seed is NOT needed to
  verify.

**Key Storage:**

- Store in `.env.local` for development
- Use Vercel environment variables for production
- Never commit private keys to version control

### Cryptographic Signing

Every badge is signed with both methods:

#### Data Integrity Proof (eddsa-rdfc-2022 - Primary)

- **Stack:** `@digitalbazaar/vc` + `@digitalbazaar/data-integrity` +
  `@digitalbazaar/eddsa-rdfc-2022-cryptosuite` (the reference implementation)
- **Document loader:** fully offline — Digital Bazaar's `securityLoader`
  extended with the vendored OB 3.0 context (`/lib/openbadges/data/`); our
  own signing/verification never fetches contexts over the network
- **Verification Method:** `{baseUrl}/api/badge/issuer#key-ed25519`, listed
  as a Multikey in the issuer profile with `controller` = issuer id
- **Baking:** Credential embedded in SVG as
  `<openbadges:credential><![CDATA[{json}]]></openbadges:credential>`
  (no `verify` attribute)
- **Consumers:** Credly and other certified OB 3.0 displayers

#### JWT Proof Format (RS256 - Secondary)

- **Algorithm:** RS256 (RSA with SHA-256) per OpenBadges 3.0 spec section 8.2.3
- **Key Reference:** `kid` header points to `{baseUrl}/api/badge/keys/key-1`
- **Public Key:** Exposed as JWK at the keys endpoint and issuer profile
- **Format:** Compact JWS (header.payload.signature)
- **Verification:** External validators can dereference public key from issuer endpoint
- **Consumers:** 1EdTech OB30Inspector validator
- **Baking (legacy badges only):** JWT embedded in SVG using
  `<openbadges:credential verify="{jwt}">`

---

## Multi-Tenant Support

### Conference-Specific Configuration

Each conference can have:

- **Custom domains:** `conference.domains[]`
- **Organization name:** `conference.organizer`
- **Contact email:** `conference.contactEmail`
- **Branding:** Conference-specific badge designs

### Dynamic Email Configuration

Badges are sent from conference-specific addresses:

- Format: `{organizer} <{contactEmail}>`
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
