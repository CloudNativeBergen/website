# Edition Lifecycle: Next Edition, Archiving, and Triggers (#1990)

Status: Design doc (part of #1772, resolving #1990). Decisions ratified 2026-11-06.

## 1. Current State

Lifecycle state is split across stores:

- **Tenant-directory D1:** Stores `conferences.lifecycle` (`draft | live | cancelled | archived`, updated in PR #2015).
- **Sanity homepage override:** Sanity `lifecycleStatus` (`cancelled | archived`, `sanity/schemaTypes/conference.ts:2229-2248`) acts as a homepage presentation toggle (`src/lib/homepage/lifecycle.ts:25-50`). Tenant-directory D1 `lifecycle` is the authoritative source of truth.
- **Ended editions:** Editions whose `endDate` has passed remain `live` indefinitely until archived. There is no auto-archive timer.
- **Existing create-edition flow:** The new-edition wizard (`src/app/(admin)/admin/settings/new-edition/page.tsx`) calls `api.conference.createEdition` (`src/server/routers/conference.ts:1520-1685`), cloning Sanity settings into a new document with `visibility: 'unlisted'`. It does not yet provision tenant-directory D1 or conference D1 rows.
- **Tenant provisioning (#1924):** Inserts conferences with `lifecycle: 'draft'`, hiding them from public routing until published.

## 2. Lifecycle State Machine

```
               ┌─────────────┐
               │    Draft    │
               └──────┬──────┘
                      │ Publish (checks live-edition quota)
                      ▼
               ┌─────────────┐
        ┌─────►│    Live     ├─────┐
        │      └──────┬──────┘     │
        │             │            │ Start guided archive workflow
Manual  │             │ Cancel     │ (checklist + confirmation)
reopen  │             │            ▼
(op only)             │     ┌──────────────┐
        │             │     │   Archived   │
        │             │     └──────────────┘
        │             ▼
        │      ┌─────────────┐
        └──────┤  Cancelled  │
               └─────────────┘
```

- **States:**
  - `draft`: In preparation. Hidden from public routing unless signed in as org member. Registration closed; CFP/programme unlisted.
  - `live`: Active edition. Publicly routed. Exactly one edition holds the bare `<org>.konf.run` alias unless extra concurrent live editions are licensed.
  - `archived`: Ended edition. Permanent historical record at `<org>-<year>.konf.run` and `<year>.<customDomain>`. Admin is read-only; programme and content frozen. Stores `archived_by` and `archived_at`.
  - `cancelled`: Explicit abort before or during event. Public homepage shows cancellation notice.
- **Transitions and Drivers:**
  - `draft -> live`: Manual action in Kontroll or `/admin`. Guardrails: valid dates, contact email, verified domain, and quota check against the org's live-edition allowance. If ready, bare platform alias points here.
  - `live -> archived`: Deliberate guided workflow initiated by an organizer or operator in Kontroll or `/admin`. Never automatic. Requires completing a checklist and explicit confirmation. Records `archived_by` and `archived_at`.
  - `live -> cancelled` / `draft -> cancelled`: Manual action with type-to-confirm dialog (`src/server/routers/conference.ts:471`).
  - `archived -> live`: Restricted to platform operators. Re-evaluates subscription live-edition quota before reopening.
- **Gap Period & Bare Host Routing:**
  - When an event ends, the bare `<org>.konf.run` host (and root custom domain) continues serving the ended edition with a "Conference ended — see you next year" banner until the next edition goes `live`.
  - Archiving edition N locks its content but keeps serving the ended-edition banner on the bare host until edition N+1 transitions from `draft` to `live`.

## 3. The 'Create Next Edition' Flow

A single idempotent operation callable by organizers or operators:

1. **Sanity write:** Creates `conference` document with `registrationEnabled: false`, `visibility: 'unlisted'`, and `lifecycleStatus: null`.
2. **Tenant-directory D1:** Inserts `conferences` row with `lifecycle: 'draft'`, `slug: <year>`, and inherits org rollout flags. Adds permanent edition domain `<org>-<year>.konf.run`. The bare alias `<org>.konf.run` stays on the previous edition until edition N+1 goes `live`.
3. **Conference D1:** Inserts core row if `d1_write` is enabled.
4. **Settings copied vs reset:**
   - _Copied:_ Branding, themes, organizers/roles, topics, formats, sponsor tiers, contract templates, and notification channels.
   - _Reset:_ Dates, ticket integrations, proposals, talks, schedule, messages, and reminders.
5. **Idempotency:** Accepts an `Idempotency-Key` stored in `provisioning_requests`.

## 4. Archiving Guided Workflow

Archiving is a deliberate, manual process rather than an automated cron job. An organizer or operator launches the workflow in Kontroll or `/admin` and steps through a mandatory checklist:

1. **Data exports:** Prompt to download attendee lists, financial reports, CFP submissions, and receipts.
2. **Retention clocks:** Triggers privacy cleanup timers (#254): reminder logs purged after 60 days (`docs/SPEAKER_REMINDERS.md:146`), persistent notifications purged after 90 days (`docs/MESSAGING_SYSTEM.md:517`), and talk reviews/messages purged after 24 months (`docs/SPEAKER_ERASURE_RUNBOOK.md:742`).
3. **Sponsor / CRM roll-over:** Opt-in action to copy sponsor contacts and lead statuses into edition N+1's CRM pipeline as renewal leads.
4. **Domain alias hand-over:** Confirms routing. If edition N+1 is already `live`, the bare `<org>.konf.run` alias moves to N+1; otherwise, the bare alias continues serving edition N with the "Conference ended" banner. Permanent year domain `<org>-<year>.konf.run` remains unchanged.
5. **Read-only freeze:** Locks settings, CFP submissions, speaker scoring, and ticket sales. Organizers retain view and export access; edits require operator intervention. Sets JSON-LD `eventStatus` to `EventEnded` and canonical URL to the permanent year host.
6. **Explicit confirmation:** Final confirmation step requiring explicit operator/organizer sign-off. Records `archived_by` (user ID) and `archived_at` (timestamp) in D1 and Sanity.

## 5. Billing Model & Transition Hooks

- **Subscription structure:** Per-organization subscription.
  - Unlimited archived editions included.
  - 1 concurrent `live` edition included.
  - Additional concurrent `live` editions require a paid subscription add-on.
- **Transition hooks:**
  - `draft -> live`: Validates active live editions for the org. If `live_count >= allowed_live_editions`, promotion is blocked until an existing live edition is archived or the org upgrades its plan.
  - `live -> archived`: Decrements active live-edition count, freeing capacity under the subscription quota.
  - `archived -> live`: Requires quota check before allowing an operator to restore an archived edition to `live`.

## 6. Phased Rollout

1. **Phase 1 (Data & Schema):** Enum updated in PR #2015 (`conferences.lifecycle` allows `draft | live | cancelled | archived`). Add `archived_by` and `archived_at` columns. Backfill past editions (CNDN 2024, 2025) to `archived`.
2. **Phase 2 (Create Flow Alignment):** Update `createEdition` to orchestrate Sanity, tenant-directory D1, and conference D1 atomically. Keep bare alias on edition N while N+1 is in `draft`.
3. **Phase 3 (Guided Archiving Workflow):** Build the archiving wizard in Kontroll/admin with the checklist, audit fields (`archived_by`, `archived_at`), and retention clock triggers.
4. **Phase 4 (Billing Enforcement):** Hook concurrent live-edition quota checks into the `draft -> live` transition.
5. **Phase 5 (Gap Period Banner):** Render the "Conference ended — see you next year" banner on the bare host when an edition's `endDate` has passed or when archived without a successor.

## 7. Decisions (2026-11-06)

1. **Deliberate archiving process:** No auto-archive timer, cron job, or warning email cadence. Archiving is a guided workflow with a checklist and explicit confirmation, recording `archived_by` and `archived_at`.
2. **Gap period routing:** The bare `<org>` host keeps serving the last edition with a "Conference ended — see you next year" banner until the next edition is published `live`.
3. **Subscription billing:** Per-org subscription includes unlimited archived editions and 1 live edition; extra concurrent live editions cost extra. `draft -> live` enforces the active live-edition count.
4. **Lifecycle enum in D1:** Completed in PR #2015 (`draft | live | cancelled | archived`).

### Remaining Open Questions

1. **Retention clock start if archiving is deferred:** If an organizer delays the manual archiving workflow for several months post-event, should GDPR data retention clocks start automatically from `endDate`, or only upon explicit archiving?
2. **Gap banner customization:** Should the "Conference ended" banner be purely automatic, or should organizers be able to customize copy and attach an email signup form for the next edition?
