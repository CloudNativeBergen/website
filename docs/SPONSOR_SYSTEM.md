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

| Field         | Description                                         |
| ------------- | --------------------------------------------------- |
| `name`        | Company name                                        |
| `website`     | Company URL                                         |
| `logo`        | Inline SVG logo (required)                          |
| `logo_bright` | Optional bright/white variant for dark backgrounds  |
| `org_number`  | Company registration number (admin-only visibility) |

### `sponsorTier`

Defines pricing tiers for a conference. Each tier is scoped to a single conference via a reference.

| Field          | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `title`        | Tier name (e.g., "Ingress", "Service", "Pod")                             |
| `tagline`      | Short description                                                         |
| `tier_type`    | `standard`, `special` (media/community), or `addon` (booth, dinner, etc.) |
| `price[]`      | Array of `{amount, currency}` (required for standard tiers)               |
| `perks[]`      | Array of `{label, description}` (required for standard tiers)             |
| `max_quantity` | Available spots (1 = exclusive, empty = unlimited)                        |
| `sold_out`     | Boolean flag                                                              |
| `most_popular` | Boolean flag for highlighting                                             |
| `conference`   | Reference to the owning conference                                        |

### `sponsorForConference`

The CRM join document linking a sponsor to a conference with relationship metadata. This is the central document the CRM pipeline operates on.

| Field               | Description                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `sponsor`           | Reference to `sponsor` document                                                                        |
| `conference`        | Reference to `conference` document                                                                     |
| `tier`              | Reference to a `sponsorTier` (standard/special)                                                        |
| `addons[]`          | Array of references to addon-type `sponsorTier` documents                                              |
| `contact_persons[]` | Per-conference contacts (name, email, phone, role, `is_primary`)                                       |
| `billing`           | Per-conference billing info (email, reference, comments)                                               |
| `status`            | Pipeline stage: `prospect` &rarr; `contacted` &rarr; `negotiating` &rarr; `closed-won` / `closed-lost` |
| `contract_status`   | `none` &rarr; `verbal-agreement` &rarr; `contract-sent` &rarr; `contract-signed`                       |
| `invoice_status`    | `not-sent` &rarr; `sent` &rarr; `paid` / `overdue` / `cancelled`                                       |
| `assigned_to`       | Reference to an organizer (speaker with `is_organizer: true`)                                          |
| `contract_value`    | Actual contract value (defaults to tier price)                                                         |
| `contract_currency` | `NOK`, `USD`, `EUR`, or `GBP`                                                                          |
| `tags[]`            | Classification tags (see Tags section below)                                                           |
| `notes`             | Freeform text                                                                                          |
| Timestamps          | `contact_initiated_at`, `contract_signed_at`, `invoice_sent_at`, `invoice_paid_at`                     |

Contact person roles are defined by `CONTACT_ROLE_OPTIONS` in `src/lib/sponsor/types.ts`. The `is_primary` flag identifies the main contact for contract signing (Phase 2).

### `sponsorActivity`

Audit log for CRM actions. Each activity references a `sponsorForConference` document.

| Field           | Description                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `activity_type` | `stage_change`, `invoice_status_change`, `contract_status_change`, `contract_signed`, `note`, `email`, `call`, `meeting` |
| `description`   | Human-readable summary                                                                                                   |
| `metadata`      | Structured data with `old_value`, `new_value`, `timestamp`, `additional_data`                                            |
| `created_by`    | Reference to the organizer who performed the action                                                                      |
| `created_at`    | ISO timestamp                                                                                                            |

## Status Enumerations

All CRM status values are defined as TypeScript union types in `src/lib/sponsor-crm/types.ts` and as UI constants (with labels and icons) in `src/components/admin/sponsor-crm/form/constants.ts`.

### Pipeline Status (`SponsorStatus`)

`prospect` &rarr; `contacted` &rarr; `negotiating` &rarr; `closed-won` / `closed-lost`

### Contract Status (`ContractStatus`)

`none` &rarr; `verbal-agreement` &rarr; `contract-sent` &rarr; `contract-signed`

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
| `is_default`  | Default template for its category                                                               |
| `sort_order`  | Ordering in the template picker                                                                 |

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
│   └── sponsor-crm/                # CRM pipeline domain
│       ├── types.ts                # CRM-specific types (statuses, activities, inputs)
│       ├── sanity.ts               # CRM CRUD, copy/import operations
│       ├── activity.ts             # Activity logging helpers
│       ├── activities.ts           # Activity list/query operations
│       ├── action-items.ts         # Action item management
│       └── bulk.ts                 # Bulk update/delete operations
├── server/
│   ├── routers/sponsor.ts          # tRPC router (all sponsor procedures)
│   └── schemas/
│       ├── sponsor.ts              # Zod schemas for core sponsor operations
│       └── sponsorForConference.ts # Zod schemas for CRM operations
├── components/
│   ├── Sponsors.tsx                # Public sponsor display (grouped by tier)
│   ├── SponsorLogo.tsx             # Public inline SVG logo renderer
│   ├── SponsorThankYou.tsx         # Marketing thank-you card for sponsors
│   ├── sponsor/
│   │   └── SponsorProspectus.tsx   # Public sponsorship prospectus page
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
│       │   └── SponsorTemplatePicker.tsx    # Email template selector dropdown
│       └── sponsor-crm/            # CRM pipeline admin UI
│           ├── SponsorCRMPageClient.tsx     # CRM page shell
│           ├── SponsorCRMPipeline.tsx       # Main board with filters/search
│           ├── SponsorCRMForm.tsx           # CRM entry create/edit form
│           ├── SponsorBoardColumn.tsx       # Kanban column
│           ├── SponsorCard.tsx              # Kanban card
│           ├── SponsorBulkActions.tsx       # Multi-select action bar
│           ├── BoardViewSwitcher.tsx        # Pipeline/Contract/Invoice toggle
│           ├── ImportHistoricSponsorsButton.tsx # Historic import dialog
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
    ├── (main)/sponsor/page.tsx     # Public /sponsor prospectus page
    └── (admin)/admin/
        ├── sponsors/
        │   ├── page.tsx            # Sponsor management page
        │   ├── crm/page.tsx        # CRM pipeline page
        │   └── tiers/page.tsx      # Tier management page
        └── marketing/page.tsx      # Marketing page (includes SponsorThankYou)

sanity/schemaTypes/
├── sponsor.ts                      # Sponsor document schema
├── sponsorTier.ts                  # Tier document schema
├── sponsorForConference.ts         # CRM join document schema
└── sponsorActivity.ts              # Activity log schema
```

### API Layer

All sponsor operations go through a single tRPC router at `src/server/routers/sponsor.ts`, organized into namespaces. See `docs/TRPC_SERVER_ARCHITECTURE.md` for general tRPC patterns.

| Namespace                      | Procedures                                                                                                                                                                                             | Purpose                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `sponsor.*`                    | `list`, `getById`, `create`, `update`, `delete`                                                                                                                                                        | Core sponsor company CRUD            |
| `sponsor.tiers.*`              | `list`, `listByConference`, `getById`, `create`, `update`, `delete`                                                                                                                                    | Tier management                      |
| `sponsor.addToConference`      | —                                                                                                                                                                                                      | Link sponsor to conference with tier |
| `sponsor.updateTierAssignment` | —                                                                                                                                                                                                      | Change tier assignment               |
| `sponsor.removeFromConference` | —                                                                                                                                                                                                      | Unlink sponsor from conference       |
| `sponsor.crm.*`                | `listOrganizers`, `list`, `getById`, `create`, `update`, `moveStage`, `updateInvoiceStatus`, `updateContractStatus`, `bulkUpdate`, `bulkDelete`, `delete`, `copyFromPreviousYear`, `importAllHistoric` | CRM pipeline operations              |
| `sponsor.crm.activities.*`     | `list`                                                                                                                                                                                                 | Activity log queries                 |

All procedures are protected by `adminProcedure` (requires `is_organizer: true`).

### CRM Board Views

The CRM pipeline UI (`SponsorCRMPipeline`) supports three Kanban board views, each grouping sponsors by a different status dimension:

| View         | Groups by         | Columns from        |
| ------------ | ----------------- | ------------------- |
| **Pipeline** | `status`          | `STATUSES`          |
| **Contract** | `contract_status` | `CONTRACT_STATUSES` |
| **Invoice**  | `invoice_status`  | `INVOICE_STATUSES`  |

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

## Public-Facing Components

The public website displays sponsors using data fetched from Sanity (not through tRPC):

- **`Sponsors`** — renders sponsors grouped by tier on the homepage and conference pages
- **`SponsorLogo`** — renders inline SVG logos with optional dark-mode bright variants
- **`SponsorProspectus`** — the `/sponsor` page showing tier options, pricing, and perks for potential sponsors
- **`SponsorThankYou`** — marketing card used in the admin marketing page for social media assets

## Testing

Tests are located in `__tests__/` mirroring the source structure:

| Test file                                  | Covers                                       |
| ------------------------------------------ | -------------------------------------------- |
| `lib/sponsor/validation.test.ts`           | Sponsor and tier input validation            |
| `lib/sponsor/utils.test.ts`                | Tier sorting, formatting, grouping utilities |
| `lib/sponsor/templates.test.ts`            | Template variable processing utilities       |
| `lib/sponsor/sponsorForConference.test.ts` | CRM Sanity operations                        |
| `lib/sponsor-crm/bulk.test.ts`             | Bulk update/delete operations                |
| `components/Sponsors.test.tsx`             | Public sponsor display component             |
| `components/SponsorLogo.test.tsx`          | Logo rendering                               |
| `components/SponsorProspectus.test.tsx`    | Prospectus page                              |

## Roadmap

The sponsor system is being developed in phases. Phase 1 (CRM pipeline, covered above) is largely complete. The north star for the next iteration is defined in [Milestone 4: CRM Phase 2](https://github.com/CloudNativeBergen/website/milestone/4).

### Phase 2: Contract Signing & Automation ([#307](https://github.com/CloudNativeBergen/website/issues/307))

End-to-end sponsor contract workflow with digital signatures, automated reminders, and self-service onboarding. The goal is **zero manual steps** after an organizer clicks "Send Contract" in the CRM.

**Key outcomes:**

- 1-click contract sending from the CRM board
- BankID e-signatures via Posten.no integration
- Automated reminders for unsigned contracts
- Self-service onboarding portal for sponsors (logo, billing, contacts)
- Full activity tracking throughout the contract lifecycle

**Sub-issues and dependencies:**

```text
#300 (Schema) ─────────────────┬──▶ #303 (Posten.no) ──▶ #304 (Admin UI)
                               │
#301 (Templates) ──────────────┤
                               │
#302 (Email Templates) ────────┼──▶ #305 (Automation)
                               │
                               └──▶ #306 (Onboarding Portal)
```

| Issue                                                           | Summary                                                                                   | Status |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------ |
| [#300](https://github.com/CloudNativeBergen/website/issues/300) | Schema extensions (`signature_status`, `signer_email`, `contract_document`, `is_primary`) | Open   |
| [#301](https://github.com/CloudNativeBergen/website/issues/301) | Contract template system with tier-based PDF generation                                   | Done   |
| [#302](https://github.com/CloudNativeBergen/website/issues/302) | Sponsor email templates (ContractSent, ContractReminder, WelcomeOnboarding)               | Open   |
| [#303](https://github.com/CloudNativeBergen/website/issues/303) | Posten.no e-signature integration (OAuth2, BankID, webhooks)                              | Open   |
| [#304](https://github.com/CloudNativeBergen/website/issues/304) | Admin UI — send contract flow with signature status badges                                | Open   |
| [#305](https://github.com/CloudNativeBergen/website/issues/305) | Automated contract reminders (daily cron, Slack notifications)                            | Open   |
| [#306](https://github.com/CloudNativeBergen/website/issues/306) | Sponsor self-service onboarding portal (`/sponsor/onboarding/[token]`)                    | Open   |

### Related Issues

- [#308](https://github.com/CloudNativeBergen/website/issues/308) — Bulk operations, individual email, and contact editing improvements
- [#294](https://github.com/CloudNativeBergen/website/issues/294) — Admin page for sponsorship prospectus configuration
- [#288](https://github.com/CloudNativeBergen/website/issues/288) — Audit all sponsor communications to use `sponsor_email`

## Key Design Decisions

**Separated sponsor vs. CRM types.** A sponsor company (`sponsor`) is a conference-independent entity holding only company-level data (name, logo, website). Contact persons and billing details live on `sponsorForConference` — the per-conference relationship record — since contacts and billing arrangements often differ between conferences/years.

**Sanity as the single source of truth.** All data lives in Sanity, with tRPC providing validated, type-safe access. There is no separate database.

**Activity logging.** CRM status changes are automatically logged as `sponsorActivity` documents, creating an audit trail without requiring manual note-taking.

**Constants with UI metadata.** Status enumerations are defined as TypeScript types in `lib/` and enriched with labels, column labels, and icons in `form/constants.ts`. The Kanban board columns are derived from these constants.

**Historic import.** The `importAllHistoric` procedure scans all previous conferences and imports sponsors that are not yet in the target conference, automatically tagging them as `returning-sponsor` or `previously-declined` based on their prior relationship.
