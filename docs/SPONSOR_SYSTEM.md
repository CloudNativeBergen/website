# Sponsor System

## Overview

The sponsor system manages the full lifecycle of conference sponsorships — from prospecting and outreach through contract negotiation, invoicing, and public display on the conference website. It is one of the most critical subsystems since sponsorship revenue directly funds the conference.

The system is split into two distinct domains:

1. **Sponsor Management** — the core sponsor entity registry (companies, logos, tiers, and public-facing display)
2. **Sponsor CRM** — the per-conference relationship pipeline that tracks the status, contracts, invoices, and activity history for each sponsor engagement

Both domains share the same tRPC router (`sponsor.*`) and Sanity backend, but have separate type systems, libraries, and UI components.

## Data Model

All sponsor data is stored in Sanity CMS across five document types:

### `sponsor`

The base company record. Conference-independent — a single sponsor can participate across multiple conferences/years.

| Field        | Description                                                |
| ------------ | ---------------------------------------------------------- |
| `name`       | Company name                                               |
| `website`    | Company URL                                                |
| `logo`       | Inline SVG logo                                            |
| `logoBright` | Optional bright/white variant for dark backgrounds         |
| `orgNumber`  | Company registration number (admin-only visibility)        |
| `address`    | Registered company address (admin-only, used in contracts) |

### `sponsorTier`

Defines pricing tiers for a conference. Each tier is scoped to a single conference via a reference.

| Field         | Description                                                               |
| ------------- | ------------------------------------------------------------------------- |
| `title`       | Tier name (e.g., "Ingress", "Service", "Pod")                             |
| `tagline`     | Short description                                                         |
| `tierType`    | `standard`, `special` (media/community), or `addon` (booth, dinner, etc.) |
| `price[]`     | Array of `{amount, currency}` (required for standard tiers)               |
| `perks[]`     | Array of `{label, description}` (required for standard tiers)             |
| `maxQuantity` | Available spots (1 = exclusive, empty = unlimited)                        |
| `soldOut`     | Boolean flag                                                              |
| `mostPopular` | Boolean flag for highlighting                                             |
| `conference`  | Reference to the owning conference                                        |

### `sponsorForConference`

The CRM join document linking a sponsor to a conference with relationship metadata. This is the central document the CRM pipeline operates on.

| Field                     | Description                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `sponsor`                 | Reference to `sponsor` document                                                                        |
| `conference`              | Reference to `conference` document                                                                     |
| `tier`                    | Reference to a `sponsorTier` (standard/special)                                                        |
| `addons[]`                | Array of references to addon-type `sponsorTier` documents                                              |
| `contactPersons[]`        | Per-conference contacts (name, email, phone, role, `isPrimary`)                                        |
| `billing`                 | Per-conference billing info (email, reference, comments)                                               |
| `status`                  | Pipeline stage: `prospect` &rarr; `contacted` &rarr; `negotiating` &rarr; `closed-won` / `closed-lost` |
| `contractStatus`          | `none` &rarr; `verbal-agreement` &rarr; `contract-sent` &rarr; `contract-signed`                       |
| `signatureStatus`         | Digital signature state: `not-started` &rarr; `pending` &rarr; `signed` / `rejected` / `expired`       |
| `signatureId`             | External ID from e-signing provider (read-only)                                                        |
| `signerEmail`             | Email of the person designated to sign the contract                                                    |
| `signingUrl`              | Adobe Sign signing URL for portal display and reminder emails (read-only)                              |
| `contractSentAt`          | When the contract was sent for signing (read-only)                                                     |
| `organizerSignedBy`       | Name of the organizer who counter-signed the contract (read-only)                                      |
| `organizerSignedAt`       | When the organizer counter-signed (read-only)                                                          |
| `contractDocument`        | Generated PDF contract stored as a Sanity file asset                                                   |
| `reminderCount`           | Number of contract signing reminders sent (read-only)                                                  |
| `contractTemplate`        | Reference to the `contractTemplate` used to generate the contract                                      |
| `invoiceStatus`           | `not-sent` &rarr; `sent` &rarr; `paid` / `overdue` / `cancelled`                                       |
| `assignedTo`              | Reference to an organizer (speaker with `isOrganizer: true`)                                           |
| `contractValue`           | Actual contract value (defaults to tier price)                                                         |
| `contractCurrency`        | `NOK`, `USD`, `EUR`, or `GBP`                                                                          |
| `tags[]`                  | Classification tags (see Tags section below)                                                           |
| `notes`                   | Freeform text                                                                                          |
| `registrationToken`       | Unique token for sponsor self-service registration portal (read-only)                                  |
| `registrationComplete`    | Whether the sponsor has completed registration (read-only)                                             |
| `registrationCompletedAt` | When the sponsor completed registration (read-only)                                                    |
| Timestamps                | `contactInitiatedAt`, `contractSignedAt`, `invoiceSentAt`, `invoicePaidAt`                             |

Contact person roles are defined by `CONTACT_ROLE_OPTIONS` in `src/lib/sponsor/types.ts`. The `isPrimary` flag identifies the main contact for contract signing.

### `contractTemplate`

Defines the structure and content for contract PDF generation. Each template is scoped to a conference and optionally to a specific tier. Supports variable substitution via `{{{VARIABLE}}}` placeholders.

| Field        | Description                                                           |
| ------------ | --------------------------------------------------------------------- |
| `title`      | Internal name for identification                                      |
| `conference` | Reference to the owning conference                                    |
| `tier`       | Optional reference to a `sponsorTier` for tier-specific contracts     |
| `language`   | `nb` (Norwegian) or `en` (English)                                    |
| `currency`   | Default currency for this template                                    |
| `sections[]` | Ordered array of `{ heading, body }` — body is PortableText with vars |
| `headerText` | Text shown in PDF header (e.g. organization name)                     |
| `footerText` | Text shown in PDF footer (e.g. org number, contact info)              |
| `terms`      | General terms &amp; conditions (PortableText, included as Appendix 1) |
| `isDefault`  | Fallback template when no tier-specific template exists               |
| `isActive`   | Whether this template is available for use                            |

**Contract template variables:** `SPONSOR_NAME`, `SPONSOR_ORG_NUMBER`, `SPONSOR_ADDRESS`, `SPONSOR_WEBSITE`, `CONTACT_NAME`, `CONTACT_EMAIL`, `TIER_NAME`, `TIER_TAGLINE`, `CONTRACT_VALUE`, `CONTRACT_VALUE_NUMBER`, `CONTRACT_CURRENCY`, `CONFERENCE_TITLE`, `CONFERENCE_DATE`, `CONFERENCE_DATES`, `CONFERENCE_YEAR`, `CONFERENCE_CITY`, `VENUE_NAME`, `VENUE_ADDRESS`, `TODAY_DATE`, `ORG_NAME`, `ORG_ORG_NUMBER`, `ORG_ADDRESS`, `ORG_EMAIL`, `ADDONS_LIST`.

### `sponsorActivity`

Audit log for CRM actions. Each activity references a `sponsorForConference` document.

| Field          | Description                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `activityType` | `stage_change`, `invoice_status_change`, `contract_status_change`, `contract_signed`, `note`, `email`, `call`, `meeting`, `signature_status_change`, `registration_complete`, `contract_reminder_sent` |
| `description`  | Human-readable summary                                                                                                                                                                                 |
| `metadata`     | Structured data with `oldValue`, `newValue`, `timestamp`, `additionalData`                                                                                                                             |
| `createdBy`    | Reference to the organizer who performed the action                                                                                                                                                    |
| `createdAt`    | ISO timestamp                                                                                                                                                                                          |

## Status Enumerations

All CRM status values are defined as TypeScript union types in `src/lib/sponsor-crm/types.ts` and as UI constants (with labels and icons) in `src/components/admin/sponsor-crm/form/constants.ts`.

### Pipeline Status (`SponsorStatus`)

`prospect` &rarr; `contacted` &rarr; `negotiating` &rarr; `closed-won` / `closed-lost`

### Contract Status (`ContractStatus`)

`none` &rarr; `verbal-agreement` &rarr; `contract-sent` &rarr; `contract-signed`

### Signature Status (`SignatureStatus`)

`not-started` &rarr; `pending` &rarr; `signed` / `rejected` / `expired`

### Invoice Status (`InvoiceStatus`)

`not-sent` &rarr; `sent` &rarr; `paid` / `overdue` / `cancelled`

### Tags (`SponsorTag`)

Tags are classification labels applied to CRM entries: `warm-lead`, `returning-sponsor`, `cold-outreach`, `referral`, `high-priority`, `needs-follow-up`, `multi-year-potential`, `previously-declined`.

### `sponsorEmailTemplate`

Reusable email templates stored in Sanity for sponsor outreach. Global (not conference-scoped) — conference context is injected via `{{{VARIABLE}}}` placeholders at send time.

| Field         | Description                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `title`       | Admin-facing label (e.g. "Cold Outreach")                                                       |
| `slug`        | Stable identifier for programmatic reference                                                    |
| `category`    | `cold-outreach`, `returning-sponsor`, `international`, `local-community`, `follow-up`, `custom` |
| `subject`     | Email subject line with `{{{VAR}}}` placeholders                                                |
| `body`        | PortableText body with `{{{VAR}}}` placeholders in text spans                                   |
| `description` | Internal notes on when to use this template                                                     |
| `isDefault`   | Default template for its category                                                               |
| `sortOrder`   | Ordering in the template picker                                                                 |

**Available template variables:** `CONTACT_NAMES`, `SPONSOR_NAME`, `ORG_NAME`, `CONFERENCE_TITLE`, `CONFERENCE_DATE`, `CONFERENCE_YEAR`, `CONFERENCE_CITY`, `CONFERENCE_URL`, `SPONSOR_PAGE_URL`, `PROSPECTUS_URL`, `SENDER_NAME`, `TIER_NAME`.

## Architecture

### Directory Layout

```text
src/
├── lib/
│   ├── sponsor/                    # Core sponsor domain
│   │   ├── types.ts                # Sponsor, SponsorTier, ContactPerson, SponsorEmailTemplate types
│   │   ├── sanity.ts               # CRUD operations against Sanity (incl. email templates)
│   │   ├── templates.ts            # Template variable processing utilities
│   │   ├── utils.ts                # Sorting, formatting, grouping utilities
│   │   └── validation.ts           # Input validation for sponsors and tiers
│   ├── contract-signing/              # Provider-agnostic contract signing abstraction
│   │   ├── types.ts                # ContractSigningProvider interface, result types
│   │   ├── adobe-sign.ts           # Adobe Sign implementation of the provider
│   │   ├── self-hosted.ts          # Self-hosted signing (built-in signature pad)
│   │   └── index.ts                # Provider factory (getSigningProvider)
│   └── sponsor-crm/                # CRM pipeline domain
│       ├── types.ts                # CRM-specific types (statuses, activities, inputs)
│       ├── sanity.ts               # CRM CRUD, copy/import operations
│       ├── activity.ts             # Activity logging helpers
│       ├── activities.ts           # Activity list/query operations
│       ├── action-items.ts         # Action item management
│       ├── bulk.ts                 # Bulk update/delete operations
│       ├── contract-templates.ts   # Contract template CRUD and lookup
│       ├── contract-variables.ts   # Variable substitution for contract generation
│       ├── contract-pdf.tsx        # PDF generation using React-PDF
│       ├── contract-readiness.ts   # Contract signing readiness validation
│       ├── registration.ts          # Sponsor self-service registration (token, validation, completion)
│       └── pipeline.ts             # Pipeline aggregation utilities
├── server/
│   ├── routers/sponsor.ts          # tRPC router (all sponsor procedures)
│   ├── routers/signing.ts          # tRPC router (public contract signing)
│   └── schemas/
│       ├── sponsor.ts              # Zod schemas for core sponsor operations
│       ├── sponsorForConference.ts # Zod schemas for CRM operations
│       ├── registration.ts         # Zod schemas for registration submissions
│       └── signing.ts              # Zod schemas for contract signing
├── components/
│   ├── Sponsors.tsx                # Public sponsor display (grouped by tier)
│   ├── SponsorLogo.tsx             # Public inline SVG logo renderer
│   ├── SponsorThankYou.tsx         # Marketing thank-you card for sponsors
│   ├── email/
│   │   ├── ContractSigningTemplate.tsx  # Contract signing request email
│   │   └── ContractReminderTemplate.tsx # Automated contract reminder email
│   ├── sponsor/
│   │   ├── SponsorPortal.tsx       # Sponsor self-service portal (setup + status)
│   │   ├── SponsorProspectus.tsx   # Public sponsorship prospectus page
│   │   ├── ContractSigningPage.tsx # Self-hosted contract signing (3-step flow)
│   │   └── SignaturePadCanvas.tsx  # Canvas-based signature capture component
│   └── admin/
│       ├── sponsor/                # Sponsor management admin UI
│       │   ├── SponsorAddModal.tsx          # Create/edit sponsor company
│       │   ├── SponsorTierEditor.tsx        # Tier CRUD modal
│       │   ├── SponsorTierManagement.tsx    # Tier list with sponsor assignments
│       │   ├── SponsorTiersPageClient.tsx   # Top-level tiers page
│       │   ├── SponsorContactEditor.tsx     # Contact person editor
│       │   ├── SponsorContactTable.tsx      # Contact directory table
│       │   ├── SponsorContactActions.tsx    # Export/broadcast actions
│       │   ├── SponsorLogoEditor.tsx        # Logo upload/management
│       │   ├── SponsorDashboardMetrics.tsx  # Summary statistics
│       │   ├── SponsorActionItems.tsx       # Action item checklist
│       │   ├── SponsorActivityTimeline.tsx  # Activity log display
│       │   ├── SponsorDiscountEmailModal.tsx# Discount code emails
│       │   ├── SponsorIndividualEmailModal.tsx # Individual email compose
│       │   ├── SponsorTemplatePicker.tsx    # Email template selector dropdown
│       │   ├── SponsorEmailTemplatesPageClient.tsx # Template list + editor page
│       │   ├── SponsorEmailTemplateEditor.tsx # Full-page template editor with preview
│       │   └── AdobeSignConfigPanel.tsx     # Adobe Sign OAuth + webhook management
│       └── sponsor-crm/            # CRM pipeline admin UI
│           ├── SponsorCRMPageClient.tsx     # CRM page shell
│           ├── SponsorCRMPipeline.tsx       # Main board with filters/search
│           ├── SponsorCRMForm.tsx           # CRM entry create/edit form
│           ├── SponsorBoardColumn.tsx       # Kanban column
│           ├── SponsorCard.tsx              # Kanban card
│           ├── SponsorBulkActions.tsx       # Multi-select action bar
│           ├── BoardViewSwitcher.tsx        # Pipeline/Contract/Invoice toggle
│           ├── ContractReadinessIndicator.tsx # Contract readiness status display
│           ├── SponsorContractView.tsx      # Unified contract & portal view
│           ├── OrganizerSignatureCapture.tsx # Organizer counter-signature capture (localStorage-backed)
│           ├── ImportHistoricSponsorsButton.tsx # Historic import dialog
│           ├── MobileFilterSheet.tsx        # Mobile-responsive filter panel
│           ├── utils.ts                     # CRM-specific UI utilities
│           └── form/                        # Form sub-components
│               ├── constants.ts             # Status/tag constants with labels & icons
│               ├── SponsorCombobox.tsx       # Sponsor search/select
│               ├── TierRadioGroup.tsx        # Tier selection
│               ├── AddonsCheckboxGroup.tsx   # Addon multi-select
│               ├── StatusListbox.tsx         # Status dropdown
│               ├── TagCombobox.tsx           # Tag multi-select
│               ├── OrganizerCombobox.tsx     # Assignee picker
│               ├── ContractValueInput.tsx    # Value + currency input
│               └── SponsorGlobalInfoFields.tsx # Inline sponsor detail editing
├── hooks/
│   ├── useSponsorBroadcast.ts      # Broadcast email state management
│   ├── useSponsorCRMFormMutations.ts # CRM form mutation hooks
│   └── useSponsorDragDrop.ts       # Drag-and-drop for board columns
└── app/
    ├── (main)/sponsor/
    │   ├── page.tsx                # Public /sponsor prospectus page
    │   ├── terms/page.tsx          # Public sponsor terms page
    │   ├── onboarding/[token]/page.tsx # Legacy redirect to /sponsor/portal/[token]
    │   └── contract/sign/[token]/page.tsx # Self-hosted contract signing page
    └── (admin)/admin/
        ├── sponsors/
        │   ├── page.tsx            # Sponsor management page
        │   ├── crm/page.tsx        # CRM pipeline page
        │   ├── tiers/page.tsx      # Tier management page
        │   ├── contracts/page.tsx  # Contract template management page
        │   ├── templates/page.tsx  # Email template management page
        │   └── activity/page.tsx   # Activity log page
        └── marketing/page.tsx      # Marketing page (includes SponsorThankYou)

sanity/schemaTypes/
├── sponsor.ts                      # Sponsor document schema
├── sponsorTier.ts                  # Tier document schema
├── sponsorForConference.ts         # CRM join document schema
├── sponsorActivity.ts              # Activity log schema
├── sponsorEmailTemplate.ts         # Email template schema
└── contractTemplate.ts             # Contract template schema
```

### API Layer

All sponsor operations go through a single tRPC router at `src/server/routers/sponsor.ts`, organized into namespaces. See `docs/TRPC_SERVER_ARCHITECTURE.md` for general tRPC patterns.

| Namespace                     | Procedures                                                                                                                                                                                             | Purpose                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `sponsor.*`                   | `list`, `getById`, `create`, `update`, `delete`                                                                                                                                                        | Core sponsor company CRUD                                         |
| `sponsor.tiers.*`             | `list`, `listByConference`, `getById`, `create`, `update`, `delete`                                                                                                                                    | Tier management                                                   |
| `sponsor.crm.*`               | `listOrganizers`, `list`, `getById`, `create`, `update`, `moveStage`, `updateInvoiceStatus`, `updateContractStatus`, `bulkUpdate`, `bulkDelete`, `delete`, `copyFromPreviousYear`, `importAllHistoric` | CRM pipeline operations                                           |
| `sponsor.crm.activities.*`    | `list`                                                                                                                                                                                                 | Activity log queries                                              |
| `sponsor.emailTemplates.*`    | `list`, `create`, `update`, `delete`                                                                                                                                                                   | Email template CRUD                                               |
| `sponsor.contractTemplates.*` | `list`, `get`, `create`, `update`, `delete`, `findBest`, `contractReadiness`, `generatePdf`, `getAdobeSignAuthorizeUrl`, `disconnectAdobeSign`, `registerAdobeSignWebhook`                             | Contract template CRUD, PDF gen, and signing provider integration |

All procedures are protected by `adminProcedure` (requires `isOrganizer: true`).

### CRM Board Views

The CRM pipeline UI (`SponsorCRMPipeline`) supports three Kanban board views, each grouping sponsors by a different status dimension:

| View         | Groups by        | Columns from        |
| ------------ | ---------------- | ------------------- |
| **Pipeline** | `status`         | `STATUSES`          |
| **Contract** | `contractStatus` | `CONTRACT_STATUSES` |
| **Invoice**  | `invoiceStatus`  | `INVOICE_STATUSES`  |

Board columns support drag-and-drop (via `@dnd-kit/core`) for status transitions with optimistic updates. The `useSponsorDragDrop` hook manages drag state, and `SponsorBoardColumn`/`SponsorCard` implement the droppable/draggable behaviors.

### Data Flow

The CRM operates with a background polling interval (30 seconds) and optimistic cache updates for drag-and-drop operations, ensuring responsive UI while maintaining data consistency across multiple concurrent users. Smart polling pauses when the user is actively interacting (dragging, bulk selecting, or editing forms).

### Email Integration

Sponsor contact management integrates with the email system (see `docs/EMAIL_SYSTEM.md`) for:

- Individual sponsor emails via `SponsorIndividualEmailModal`
- Broadcast emails to all sponsors via `SponsorContactActions`
- Resend audience sync for sponsor contacts

### Ticket Integration

Sponsor tier assignments feed into the ticket allocation system, where each tier level maps to a specific number of complimentary tickets (configured in the tickets admin page).

## Contract System

The contract system enables organizers to generate, digitally sign, and track sponsorship agreements directly from the CRM. It integrates with Adobe Acrobat Sign for legally binding e-signatures, automated reminders, and webhook-driven status updates — targeting zero manual steps after an organizer clicks "Send Contract".

### Contract Templates

Contract templates are stored in Sanity as `contractTemplate` documents. Each template belongs to a conference and contains ordered sections with PortableText bodies that support `{{{VARIABLE}}}` substitution. Templates can be scoped to a specific tier or marked as a default fallback.

The `findBestContractTemplate()` function selects the most appropriate template by matching on conference, tier, and language — falling back to the default template if no tier-specific one exists.

### Contract PDF Generation

PDF generation uses React-PDF (`@react-pdf/renderer`) to produce professional contract documents. The generated PDF includes:

- Header with organizer name and logo
- Info table with parties, dates, and venue details
- Contract sections with variable substitution
- Package/tier details table
- Organizer and sponsor signature placeholder markers (invisible PDF text used by `pdf-lib` for signature positioning)
- Appendix 1: General Terms & Conditions
- Footer with organizer contact information

Variable values are built from the `SponsorForConferenceExpanded` record by `buildContractVariables()` in `contract-variables.ts`.

#### Organizer Counter-Signature

Before a contract is sent, the assigned organizer can optionally counter-sign it. The organizer draws their signature using the `OrganizerSignatureCapture` component, which stores the signature in localStorage (never on the server) and reuses it across sessions for convenience.

When sending a contract with a counter-signature:

1. The organizer&apos;s signature PNG is embedded into the generated PDF via `embedSignatureInPdfBuffer()` (from `src/lib/pdf/signature-embed.ts`), targeting the organizer-specific markers (`ORGANIZER_SIGNATURE_MARKER` / `ORGANIZER_DATE_MARKER`)
2. The `organizerSignedBy` and `organizerSignedAt` fields are recorded on the `sponsorForConference` document
3. The counter-signed PDF is used for both Sanity storage and the signing provider

Only the organizer assigned to the sponsor (`assignedTo`) can counter-sign. The attestation page timeline includes the counter-sign event when these fields are present.

### Contract Readiness

Before a contract can be generated or sent, all required data must be present. The `checkContractReadiness()` function in `contract-readiness.ts` validates 11 fields and categorizes any missing ones by responsible party and severity:

| Source        | Required Fields                                                        | Severity    |
| ------------- | ---------------------------------------------------------------------- | ----------- |
| **Organizer** | Conference name, org number, address, dates, venue name, sponsor email | Recommended |
| **Sponsor**   | Org number, address                                                    | Recommended |
| **Sponsor**   | Primary contact person (name + email)                                  | Required    |
| **Pipeline**  | Tier assignment, contract value                                        | Recommended |

A contract `canSend` when all **required** fields are present (even if recommended fields are missing). The `ContractReadinessIndicator` component displays readiness status in the CRM form — green when fully ready, amber with a categorized list of missing fields otherwise.

### Contract Signing Provider Abstraction

The contract system uses a provider-agnostic abstraction layer (`src/lib/contract-signing/`) so the CRM pipeline never interacts with signing APIs directly. This design allows the signing service to be swapped or extended without touching the CRM, router, or UI code.

#### `ContractSigningProvider` Interface

Defined in `src/lib/contract-signing/types.ts`, the interface exposes eight methods across three responsibilities:

| Category       | Method                         | Purpose                                                                      |
| -------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| **Signing**    | `sendForSigning(params)`       | Upload PDF + create signing request → returns `{ agreementId, signingUrl? }` |
| **Signing**    | `checkStatus(agreementId)`     | Poll provider for current status → returns `{ status, providerStatus }`      |
| **Signing**    | `cancelAgreement(agreementId)` | Cancel / void a pending agreement                                            |
| **Signing**    | `sendReminder(agreementId)`    | Nudge the signer via the provider                                            |
| **Connection** | `getConnectionStatus()`        | Is the provider connected? Returns `SigningProviderStatus`                   |
| **Connection** | `getAuthorizeUrl(redirectUri)` | Build OAuth authorization URL                                                |
| **Connection** | `disconnect()`                 | Revoke / clear session                                                       |
| **Webhook**    | `registerWebhook(webhookUrl)`  | Register for real-time status updates                                        |

Key result types:

- **`SendForSigningResult`** — `{ agreementId: string; signingUrl?: string }`
- **`SigningStatusResult`** — `{ status: SignatureStatus; providerStatus: string }` — maps provider-specific statuses to the unified `SignatureStatus` enum
- **`SigningProviderStatus`** — `{ connected, providerName, expiresAt?, detail?, webhookActive? }`

#### Provider Factory

`getSigningProvider()` in `src/lib/contract-signing/index.ts` returns the configured provider based on the `CONTRACT_SIGNING_PROVIDER` environment variable:

| Value         | Provider                    | Description                                 |
| ------------- | --------------------------- | ------------------------------------------- |
| `adobe-sign`  | `AdobeSignProvider`         | Adobe Acrobat Sign (default)                |
| `self-hosted` | `SelfHostedSigningProvider` | Built-in signature pad, no external service |

To add a new provider:

1. Create a class implementing `ContractSigningProvider` in `src/lib/contract-signing/<provider-name>.ts`
2. Update `getSigningProvider()` to select the provider based on an env var or conference-level setting
3. Add provider-specific webhook route at `src/app/api/webhooks/<provider-name>/route.ts`
4. Add provider-specific OAuth routes and config panel component

#### How the Router Uses the Provider

The tRPC router (`src/server/routers/sponsor.ts`) calls `getSigningProvider()` and uses only the `ContractSigningProvider` interface. For example:

```typescript
const provider = getSigningProvider()
const result = await provider.sendForSigning({
  pdf,
  filename,
  signerEmail,
  agreementName,
})
const status = await provider.checkStatus(agreementId)
await provider.cancelAgreement(agreementId)
```

No provider-specific imports appear in the router or CRM business logic.

### Adobe Acrobat Sign Provider

The current (and default) provider implementation is `AdobeSignProvider` in `src/lib/contract-signing/adobe-sign.ts`. It wraps the [Adobe Acrobat Sign REST API v6](https://developer.adobe.com/acrobat-sign/docs/overview/developer_guide/) and covers the full lifecycle: document upload, agreement creation, status tracking via webhooks, automated reminders, and signed document retrieval.

#### Authentication

Adobe Sign uses OAuth 2.0 with the **client credentials** grant type for server-to-server authentication. Tokens are requested from the Adobe IMS endpoint and cached in memory with a 60-second safety buffer before expiry.

| Detail         | Value                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| Token endpoint | `https://ims-na1.adobelogin.com/ims/token/v3`                                |
| Grant type     | `client_credentials`                                                         |
| Scopes         | `agreement_read agreement_write agreement_send`                              |
| Token lifetime | 3600 seconds (1 hour)                                                        |
| Cache strategy | In-memory with 60s buffer before expiry                                      |
| Implementation | `src/lib/adobe-sign/auth.ts` — OAuth Authorization Code flow with JWE cookie |

#### API Client

The Adobe Sign client (`src/lib/adobe-sign/client.ts`) wraps the REST v6 API with the following operations:

| Function                    | API Endpoint                       | Purpose                               |
| --------------------------- | ---------------------------------- | ------------------------------------- |
| `uploadTransientDocument()` | `POST /transientDocuments`         | Upload PDF for signing (valid 7 days) |
| `createAgreement()`         | `POST /agreements`                 | Create and send signing request       |
| `getAgreement()`            | `GET /agreements/{id}`             | Check current agreement status        |
| `getSigningUrls()`          | `GET /agreements/{id}/signingUrls` | Capture signing URL for portal/email  |
| `registerWebhook()`         | `POST /webhooks`                   | Register webhook for status changes   |
| `sendReminder()`            | `POST /agreements/{id}/reminders`  | Send a signing reminder to the signer |
| `cancelAgreement()`         | `PUT /agreements/{id}/state`       | Cancel a pending agreement            |

All API calls are authenticated via per-user OAuth session stored in an encrypted JWE cookie. The API base URL is derived from the `api_access_point` returned during OAuth (shard-specific, e.g., `https://api.eu2.adobesign.com/`).

#### Contract Send Flow

The `generateAndSendContract()` function in `src/lib/sponsor-crm/contract-send.ts` orchestrates the entire send process. It accepts a `ContractSigningProvider` instance (injected by the caller) and is used by both the admin manual send and the automated registration completion flow.

```text
1. Load sponsorForConference record
2. Find best contract template (by conference + tier + language)
3. Generate PDF via React-PDF with variable substitution
4. If organizer counter-signature provided:
   a. Embed organizer signature image + date in the PDF via pdf-lib
   b. Record organizerSignedBy + organizerSignedAt on the document
5. Upload PDF to Sanity as a file asset (permanent storage)
6. Call provider.sendForSigning(pdf, filename, signerEmail, agreementName)
   → provider handles upload + agreement creation internally
   → returns { agreementId, signingUrl? }
7. Update sponsorForConference:
   - contractStatus → "contract-sent"
   - signatureStatus → "pending"
   - signatureId → agreementId
   - signingUrl → from provider result
   - contractSentAt → now
   - contractDocument → Sanity file reference
   - signerEmail → determined by priority: explicit override > sfc.signerEmail > primary contact email
8. Send branded signing email via Resend with signing URL
9. Log sponsorActivity entries for contract status and signature status changes
```

If the signing provider is unavailable or fails, the contract PDF is still generated and stored — only the digital signing step is skipped. This graceful degradation ensures contracts can always be generated even without a signing provider configured.

#### Webhook Handler

Adobe Sign notifies our application of agreement status changes via webhooks at `/api/webhooks/adobe-sign`. The handler supports both the initial GET verification and ongoing POST notifications.

**Verification (GET):** When registering a webhook, Adobe Sign sends a GET request with an `X-AdobeSign-ClientId` header. The handler must respond with a 2XX status and echo the client ID back in both the `X-AdobeSign-ClientId` response header and JSON body (`{ xAdobeSignClientId: "<id>" }`).

**Notifications (POST):** Every POST notification also includes `X-AdobeSign-ClientId` and must be echoed back. The handler processes three event types:

| Event                          | Action                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGREEMENT_WORKFLOW_COMPLETED` | Extract signed PDF from webhook payload (inline base64), store in Sanity, set signatureStatus=signed, contractStatus=contract-signed, contractSignedAt=now |
| `AGREEMENT_RECALLED`           | Set signatureStatus=rejected                                                                                                                               |
| `AGREEMENT_EXPIRED`            | Set signatureStatus=expired                                                                                                                                |

All status changes are logged as `sponsorActivity` entries with `activityType: "signature_status_change"`.

The handler looks up the sponsor by matching `signatureId` on `sponsorForConference` documents against the `agreement.id` from the webhook event.

#### Automated Reminders

A Vercel cron job at `/api/cron/contract-reminders` runs daily (configured in `vercel.json`). It queries for contracts that:

- Have `signatureStatus == "pending"`
- Have a defined `signatureId`
- Were sent more than **5 days** ago (`contractSentAt < threshold`)
- Have fewer than **2 reminders** already sent

For each matching contract, it sends a reminder email via Resend (using `ContractReminderTemplate` with the stored `signingUrl`), increments `reminderCount`, and logs a `contract_reminder_sent` activity.

The cron endpoint is protected by a `CRON_SECRET` bearer token.

#### Environment Variables

| Variable                        | Required | Purpose                                               |
| ------------------------------- | -------- | ----------------------------------------------------- |
| `ADOBE_SIGN_APPLICATION_ID`     | Yes      | OAuth client ID for token requests                    |
| `ADOBE_SIGN_APPLICATION_SECRET` | Yes      | OAuth client secret                                   |
| `ADOBE_SIGN_CLIENT_ID`          | Yes      | Client ID for webhook verification (may equal app ID) |
| `ADOBE_SIGN_SHARD`              | No       | API shard (default: `eu2`)                            |
| `CRON_SECRET`                   | Yes      | Bearer token for cron job authentication              |

#### Adobe Sign Setup

To configure Adobe Sign for a new environment:

1. Log in to [Adobe Sign](https://secure.adobesign.com/public/login) and go to API > API Applications
2. Create a new application (domain: CUSTOMER for internal use)
3. Note the Application ID and Secret from View/Edit
4. Configure OAuth scopes: enable `agreement_read`, `agreement_write`, `agreement_send`
5. Set the four `ADOBE_SIGN_*` environment variables in Vercel
6. Register the webhook URL by calling `POST /api/rest/v6/webhooks` with the body shown below
7. Set `CRON_SECRET` in Vercel and configure the cron schedule in `vercel.json`

```json
{
  "name": "Sponsor Contract Webhooks",
  "scope": "ACCOUNT",
  "state": "ACTIVE",
  "webhookSubscriptionEvents": [
    "AGREEMENT_WORKFLOW_COMPLETED",
    "AGREEMENT_RECALLED",
    "AGREEMENT_EXPIRED"
  ],
  "webhookUrlInfo": {
    "url": "https://<domain>/api/webhooks/adobe-sign"
  }
}
```

#### Contract Data Model (on `sponsorForConference`)

The contract lifecycle is tracked across several fields on the `sponsorForConference` document:

| Field               | Type      | Description                                                               |
| ------------------- | --------- | ------------------------------------------------------------------------- |
| `contractStatus`    | Enum      | Overall contract stage (none → verbal → sent → signed)                    |
| `signatureStatus`   | Enum      | Digital signature state (not-started → pending → signed/rejected/expired) |
| `signatureId`       | String    | Agreement ID from the contract signing provider (read-only, set on send)  |
| `signerEmail`       | String    | Email of the designated signer                                            |
| `signingUrl`        | String    | Signing URL for portal and reminder emails                                |
| `contractSentAt`    | DateTime  | When the contract was sent for signing                                    |
| `organizerSignedBy` | String    | Name of the organizer who counter-signed (set on send, read-only)         |
| `organizerSignedAt` | DateTime  | When the organizer counter-signed (set on send, read-only)                |
| `contractSignedAt`  | DateTime  | When the signed PDF was received (set by webhook)                         |
| `contractDocument`  | File      | Generated/signed PDF stored as a Sanity file asset                        |
| `contractTemplate`  | Reference | The `contractTemplate` used to generate the PDF                           |
| `reminderCount`     | Number    | Signing reminders sent (max 2, tracked by cron)                           |

#### Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Admin CRM UI                             │
│  SponsorContractView  /  SponsorCRMPipeline (Contract Board)   │
└────────────┬───────────────────────┬────────────────────────────┘
             │ Manual "Send"        │ Registration auto-trigger
             ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              tRPC Router (sponsor.*)                             │
│  1. getSigningProvider()                                        │
│  2. generateAndSendContract(provider, ...)                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│        ContractSigningProvider  (src/lib/contract-signing/)     │
│                                                                 │
│  sendForSigning()   checkStatus()   cancelAgreement()           │
│  sendReminder()     getConnectionStatus()   disconnect()        │
│  getAuthorizeUrl()  registerWebhook()                           │
└────────┬───────────────────────────────────────┬────────────────┘
         │ CONTRACT_SIGNING_PROVIDER=adobe-sign  │ =self-hosted
         ▼                                       ▼
┌────────────────────────────┐   ┌────────────────────────────────┐
│   Adobe Sign REST API v6   │   │  Self-Hosted Signing           │
│                            │   │                                │
│  POST /transientDocuments  │   │  UUID token → signatureId      │
│  POST /agreements          │   │  signingUrl → /sponsor/        │
│  POST /{id}/reminders      │   │    contract/sign/{token}       │
│  GET  /{id}/combinedDoc    │   │                                │
└────────────┬───────────────┘   └──────────────┬─────────────────┘
             │ Webhook                          │ Direct submit
             ▼                                  ▼
┌────────────────────────────┐   ┌────────────────────────────────┐
│ /api/webhooks/adobe-sign   │   │  signing.submitSignature       │
│                            │   │  (tRPC, public)                │
│ WORKFLOW_COMPLETED → signed│   │                                │
│ RECALLED → rejected        │   │  1. Fetch PDF from Sanity      │
│ EXPIRED → expired          │   │  2. Embed signature via pdf-lib│
└────────────────────────────┘   │  3. Upload signed PDF          │
                                 │  4. Patch sfc → signed         │
                                 └────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              /api/cron/contract-reminders (daily)                │
│                                                                 │
│  Query pending > 5 days, < 2 reminders → send email via Resend  │
│  Increment reminderCount, log activity                          │
└─────────────────────────────────────────────────────────────────┘
```

#### Contract Design Decisions

**Provider abstraction.** The CRM pipeline and tRPC router interact exclusively with the `ContractSigningProvider` interface — never with provider-specific APIs. This makes it straightforward to add new signing providers (e.g. DocuSign) without modifying business logic.

**Graceful degradation.** If the signing provider is not connected or its API is down, contract PDF generation still works — only the e-signing step is skipped. The PDF is stored in Sanity regardless.

**Webhook-driven status updates.** Instead of polling Adobe Sign for agreement status (which has strict rate limits: 1 call/10 min for developer accounts), we rely entirely on webhooks for real-time status changes. Signed documents are extracted inline from the webhook payload (`includeSignedDocuments: true` on webhook registration) — no API calls needed in the webhook handler. This aligns with Adobe's recommended approach.

**Dual storage.** The contract PDF is stored in both Sanity (permanent, accessible via CMS) and Adobe Sign (transient, valid 7 days, then stored as part of the agreement). When the signed version arrives via webhook, it replaces the original in Sanity.

**Unified send function.** `generateAndSendContract()` is the single entry point for both manual admin sends and automated registration-triggered sends, ensuring consistent behavior and logging.

**Two-tier readiness.** Contract readiness distinguishes between `required` fields (blocks sending entirely) and `recommended` fields (allows sending with warnings). Only the primary contact person is strictly required — other fields like org number and address produce warnings but don't block the flow.

### Self-Hosted Signing Provider

The self-hosted provider (`SelfHostedSigningProvider` in `src/lib/contract-signing/self-hosted.ts`) removes the dependency on external e-signing services by handling the entire signature lifecycle within the application itself. Activated by setting `CONTRACT_SIGNING_PROVIDER=self-hosted`.

#### How It Works

1. **Send for signing:** Generates a UUID token and constructs a signing URL (`/sponsor/contract/sign/{token}`). The token is stored as `signatureId` on the `sponsorForConference` record, and the URL is included in the signing email sent to the sponsor.
2. **Signing page:** The sponsor opens the URL, reviews the contract details and embedded PDF preview, draws their signature on a canvas pad, and submits. The `signing` tRPC router handles the submission.
3. **Signature embedding:** On submit, the server fetches the original contract PDF from Sanity, embeds the PNG signature image and signer metadata (name + date) into the PDF via `pdf-lib`, uploads the signed PDF back to Sanity, and updates the `sponsorForConference` record to `signatureStatus: 'signed'` / `contractStatus: 'contract-signed'`.

#### Components

| Component             | Location                                         | Purpose                                         |
| --------------------- | ------------------------------------------------ | ----------------------------------------------- |
| `SignaturePadCanvas`  | `src/components/sponsor/SignaturePadCanvas.tsx`  | Canvas wrapper around `signature_pad` library   |
| `ContractSigningPage` | `src/components/sponsor/ContractSigningPage.tsx` | 3-step signing flow (review → sign → complete)  |
| `signingRouter`       | `src/server/routers/signing.ts`                  | Public tRPC router for contract lookup + submit |
| Signing schemas       | `src/server/schemas/signing.ts`                  | Zod validation for signing token and submission |
| Signing route         | `src/app/(main)/sponsor/contract/sign/[token]/`  | Next.js page extracting token from URL params   |

#### Signing Page Flow

```text
┌──────────────────────────────────────────────────────────────┐
│  /sponsor/contract/sign/{token}                              │
│                                                              │
│  1. REVIEW STEP                                              │
│     - Fetch contract via signing.getContract(token)          │
│     - Display: sponsor, event, tier, value, PDF preview      │
│     - Button: "Proceed to Sign"                              │
│                                                              │
│  2. SIGN STEP                                                │
│     - Full name input                                        │
│     - SignaturePadCanvas (draw signature)                    │
│     - Legal agreement checkbox                               │
│     - Button: "Submit Signature"                             │
│     - Calls signing.submitSignature mutation                 │
│                                                              │
│  3. COMPLETE STEP                                            │
│     - Success confirmation with green checkmark              │
│     - Signed document stored in Sanity                       │
└──────────────────────────────────────────────────────────────┘
```

#### CRM Integration

The self-hosted provider integrates seamlessly with the existing CRM workflow:

```text
Admin CRM: "Send Contract"
    │
    ▼
generateAndSendContract()
    │
    ├── Generates PDF via React-PDF
    ├── Uploads PDF to Sanity
    ├── Calls provider.sendForSigning()
    │     └── SelfHostedSigningProvider returns { agreementId: UUID, signingUrl }
    ├── Stores signatureId + signingUrl on sponsorForConference
    └── Sends signing email via Resend with the signing URL
    │
    ▼
Sponsor opens /sponsor/contract/sign/{token}
    │
    ├── Reviews contract → Signs on canvas → Submits
    │
    ▼
signing.submitSignature (tRPC)
    │
    ├── Fetches original PDF from Sanity
    ├── Embeds PNG signature + name + date via pdf-lib
    ├── Uploads signed PDF to Sanity (replaces original)
    └── Patches sponsorForConference:
          signatureStatus → "signed"
          contractStatus  → "contract-signed"
          contractSignedAt → now
          contractSignedBy → signer name
```

The CRM board, activity log, and sponsor portal all reflect the updated status automatically since they read from the same `sponsorForConference` record.

#### Provider Limitations

- **No automated reminders** — `sendReminder()` is a no-op. The daily cron job still sends email reminders via Resend using the stored `signingUrl`, so reminders work at the application level.
- **No webhooks** — status updates happen synchronously during signature submission, so webhooks are unnecessary.
- **No OAuth** — `getAuthorizeUrl()` and `disconnect()` are no-ops. The Adobe Sign config panel is hidden when using self-hosted signing.

#### Dependencies

| Package         | Version | Purpose                                         |
| --------------- | ------- | ----------------------------------------------- |
| `signature_pad` | 5.x     | Canvas-based signature capture (client-side)    |
| `pdf-lib`       | 1.x     | PDF manipulation — embed signature image + text |

#### Self-Hosted Environment Variables

| Variable                    | Required | Default      | Purpose                                      |
| --------------------------- | -------- | ------------ | -------------------------------------------- |
| `CONTRACT_SIGNING_PROVIDER` | No       | `adobe-sign` | Set to `self-hosted` to enable this provider |
| `NEXTAUTH_URL`              | Yes      | —            | Base URL for constructing the signing link   |

## Sponsor Portal

The sponsor portal (`/sponsor/portal/[token]`) allows sponsors to self-service their data entry after an organizer initiates the relationship. The flow:

1. Organizer generates a unique registration token via the CRM
2. Sponsor receives a link (e.g. via email) to `/sponsor/portal/{token}`
3. Sponsor fills in: company information (org number, address), contact persons, contract signer selection, and billing details
4. On submission, the system patches both the `sponsor` document (org data) and the `sponsorForConference` document (contacts, billing, signerEmail)
5. A `registration_complete` activity is logged
6. After setup, the portal shows a progressive status dashboard with contract signing link when available

Token validation checks existence, expiry, and whether registration was already completed.

## Public-Facing Components

The public website displays sponsors using data fetched from Sanity (not through tRPC):

- **`Sponsors`** — renders sponsors grouped by tier on the homepage and conference pages
- **`SponsorLogo`** — renders inline SVG logos with optional dark-mode bright variants
- **`SponsorProspectus`** — the `/sponsor` page showing tier options, pricing, and perks for potential sponsors
- **`SponsorThankYou`** — marketing card used in the admin marketing page for social media assets

## Testing

Tests are located in `__tests__/` mirroring the source structure:

| Test file                                    | Covers                                                     |
| -------------------------------------------- | ---------------------------------------------------------- |
| `lib/sponsor/validation.test.ts`             | Sponsor and tier input validation                          |
| `lib/sponsor/utils.test.ts`                  | Tier sorting, formatting, grouping utilities               |
| `lib/sponsor/templates.test.ts`              | Template variable processing utilities                     |
| `lib/sponsor/sponsorForConference.test.ts`   | CRM Zod schema validation                                  |
| `lib/sponsor-crm/bulk.test.ts`               | Bulk update/delete operations                              |
| `lib/sponsor-crm/contract-readiness.test.ts` | Contract readiness validation logic                        |
| `lib/sponsor-crm/contract-variables.test.ts` | Contract variable building and substitution                |
| `lib/sponsor-crm/registration.test.ts`       | Registration URL building                                  |
| `lib/contract-signing/provider.test.ts`      | Signing provider abstraction & factory                     |
| `lib/pdf/attestation-page.test.ts`           | Attestation page generation (incl. organizer counter-sign) |
| `components/Sponsors.test.tsx`               | Public sponsor display component                           |
| `components/SponsorLogo.test.tsx`            | Logo rendering                                             |
| `components/SponsorProspectus.test.tsx`      | Prospectus page                                            |

## Roadmap

The sponsor system is being developed in phases. Phase 1 (CRM pipeline, covered above) is largely complete. The north star for the next iteration is defined in [Milestone 4: CRM Phase 2](https://github.com/CloudNativeBergen/website/milestone/4).

### Phase 2: Contract Signing & Automation ([#307](https://github.com/CloudNativeBergen/website/issues/307))

End-to-end sponsor contract workflow with digital signatures, automated reminders, and self-service registration. The goal is **zero manual steps** after an organizer clicks "Send Contract" in the CRM.

**Key outcomes:**

- 1-click contract sending from the CRM board
- Digital signatures via Adobe Acrobat Sign
- Automated reminders for unsigned contracts (daily cron via Resend)
- Self-service registration portal for sponsors (logo, billing, contacts)
- Full activity tracking throughout the contract lifecycle
- Admin panel for Adobe Sign OAuth connection and webhook management

**Sub-issues and dependencies:**

```text
#300 (Schema) ─────────────────┬──▶ #303 (Adobe Sign) ──▶ #304 (Admin UI)
                               │
#301 (Templates) ──────────────┤
                               │
#302 (Email Templates) ────────┼──▶ #305 (Automation)
                               │
                               └──▶ #306 (Registration Portal)
```

| Issue                                                           | Summary                                                                                  | Status |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| [#300](https://github.com/CloudNativeBergen/website/issues/300) | Schema extensions (`signature_status`, `signer_email`, `contract_document`, `isPrimary`) | Done   |
| [#301](https://github.com/CloudNativeBergen/website/issues/301) | Contract template system with tier-based PDF generation                                  | Done   |
| [#302](https://github.com/CloudNativeBergen/website/issues/302) | Sponsor email templates (ContractSigning, ContractReminder)                              | Done   |
| [#303](https://github.com/CloudNativeBergen/website/issues/303) | Adobe Acrobat Sign integration (OAuth2, webhooks, signing URLs)                          | Done   |
| [#304](https://github.com/CloudNativeBergen/website/issues/304) | Admin UI — send contract flow, AdobeSignConfigPanel, signature badges                    | Done   |
| [#305](https://github.com/CloudNativeBergen/website/issues/305) | Automated contract reminders (daily cron, branded emails via Resend)                     | Done   |
| [#306](https://github.com/CloudNativeBergen/website/issues/306) | Sponsor self-service portal (`/sponsor/portal/[token]`)                                  | Done   |

### Related Issues

- [#308](https://github.com/CloudNativeBergen/website/issues/308) — Bulk operations, individual email, and contact editing improvements
- [#294](https://github.com/CloudNativeBergen/website/issues/294) — Admin page for sponsorship prospectus configuration
- [#288](https://github.com/CloudNativeBergen/website/issues/288) — Audit all sponsor communications to use `sponsorEmail`

## Key Design Decisions

**Separated sponsor vs. CRM types.** A sponsor company (`sponsor`) is a conference-independent entity holding only company-level data (name, logo, website, org number, address). Contact persons and billing details live on `sponsorForConference` — the per-conference relationship record — since contacts and billing arrangements often differ between conferences/years.

**`sponsorForConference` as the single source of truth.** All conference-sponsor relationships are managed exclusively through `sponsorForConference` documents. There is no inline `sponsors[]` array on conference documents. Public-facing pages query `sponsorForConference` docs with `status == "closed-won"` and project them into the `ConferenceSponsor` shape. The `Conference.sponsors` TypeScript property is populated at runtime from this query for backward compatibility with downstream consumers.

**Sanity as the single source of truth.** All data lives in Sanity, with tRPC providing validated, type-safe access. There is no separate database.

**Activity logging.** CRM status changes are automatically logged as `sponsorActivity` documents, creating an audit trail without requiring manual note-taking.

**Constants with UI metadata.** Status enumerations are defined as TypeScript types in `lib/` and enriched with labels, column labels, and icons in `form/constants.ts`. The Kanban board columns are derived from these constants.

**Historic import.** The `importAllHistoric` procedure scans all previous conferences and imports sponsors that are not yet in the target conference, automatically tagging them as `returning-sponsor` or `previously-declined` based on their prior relationship.
