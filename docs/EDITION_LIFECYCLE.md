# Edition Lifecycle: Next Edition, Archiving, and Triggers (#1990)

Status: Design doc only (part of #1772, resolving #1990). No code changes.

## 1. Current State

Today, lifecycle state is fragmented across stores and largely manual:

- **D1 lifecycle is derived only from Sanity `lifecycleStatus`:** Tenant-directory D1 stores `conferences.lifecycle` (`draft | live | archived`, `services/tenant-directory/migrations/0001_init.sql:17`). In `services/tenant-directory/scripts/backfill.ts:124-130`, `cancelled` and `archived` map to `archived`, and everything else maps to `live`. Conference `endDate` is completely ignored.
- **No archiving job exists:** Ended editions (e.g., CNDN 2024 and 2025) remain `lifecycleStatus: null` in Sanity and `lifecycle: 'live'` in D1 indefinitely (#1990).
- **Sanity homepage override vs D1 lifecycle:** Sanity `lifecycleStatus` (`cancelled | archived`, `sanity/schemaTypes/conference.ts:2229-2248`) is merely a homepage presentation override (`src/lib/homepage/lifecycle.ts:25-50, 331-332`) toggled via `updateLifecycleStatus` (`src/server/routers/conference.ts:465-477`). It is not an engine state. Tenant-directory exposes its D1 `lifecycle` as `lifecycleStatus` to GraphQL (`services/tenant-directory/src/subgraph.ts:50-58`), but Kontroll also reads Sanity directly (`src/lib/conference/contract.ts:54, 88`), seeing the stale status.
- **Existing new-edition flow is Sanity-only:** The site wizard (`src/app/(admin)/admin/settings/new-edition/page.tsx:1-85`) calls `api.conference.createEdition` (`src/server/routers/conference.ts:1520-1685`). It clones settings into a new Sanity document (`src/lib/conference/edition.ts:305-380`), sets `registrationEnabled: false` and `visibility: 'unlisted'` (`edition.ts:347-353`), and transfers the bare platform alias (`<org>.konf.run`) in Sanity. **It writes nothing to tenant-directory D1, nothing to conference D1, sets no rollout flags, and does not archive edition N.**
- **Tenant provisioning (#1924) creates draft editions:** `registerTenant` (`services/tenant-directory/src/data/index.ts:356-368`) inserts conferences with `lifecycle: 'draft'`. In tenant-directory, public requests for `draft` editions return `null` (`services/tenant-directory/src/data/index.ts:217, 228`), hiding unpublished editions until promoted.

## 2. Proposed Lifecycle State Machine

```
               ┌─────────────┐
               │    Draft    │
               └──────┬──────┘
                      │ Organizer / Operator publishes
                      ▼
               ┌─────────────┐
        ┌─────►│    Live     ├─────┐
        │      └──────┬──────┘     │
        │             │            │ Auto: N+1 goes live OR endDate + 30d
Manual  │             │ Cancelled  │ Manual: Operator / Organizer button
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
  - `draft`: In preparation. Blocked from public routing unless signed-in org member (`tenant-directory/src/data/index.ts:217`). Registration closed; CFP/programme unlisted.
  - `live`: Active edition. Publicly routed. Exactly one edition per org holds the bare `<org>.konf.run` alias.
  - `archived`: Ended edition. Permanent historical record at `<org>-<year>.konf.run` and `<year>.<customDomain>`. Admin is read-only; programme and content frozen.
  - `cancelled`: Explicit abort before or during event. Public homepage replaced with cancellation notice.
- **Transitions and Drivers:**
  - `draft -> live`: Manual action in Kontroll or `/admin`. Guardrails: valid dates, contact email, and verified edition domain. If org has an active `live` edition N, publishing N+1 triggers archiving of N.
  - `live -> archived`: Dual-trigger. **Scheduled:** Daily cron checks `endDate + 30 days` and transitions edition. **Event-driven:** Automatically triggered when edition N+1 transitions `draft -> live`. **Manual:** "Archive edition" button in admin/Kontroll for immediate wrap-up.
  - `live -> cancelled` / `draft -> cancelled`: Explicit manual action with type-to-confirm dialog (`src/server/routers/conference.ts:471`).
  - `archived -> live`: Restricted to platform operators to prevent accidental alias hijacking.
- **Guardrails:**
  - Only ONE edition per org may hold `kind = 'platform-alias'` (`services/tenant-directory/migrations/0001_init.sql:28`).
  - Archived editions never hold the bare platform alias; they route strictly on permanent year hostnames.
  - Tenant-directory D1 `conferences.lifecycle` is the authoritative source of truth.

## 3. The 'Create Next Edition' Flow

A single idempotent operation callable by organizers or operators in Kontroll or `/admin`:

1. **Sanity write:** Creates `conference` document using Sanity `_id = generateKey('conference')` (`src/server/routers/conference.ts:1570`), copies configured families, sets `registrationEnabled: false`, `visibility: 'unlisted'`, and `lifecycleStatus: null`.
2. **Tenant-directory D1:** Inserts `conferences` row with `lifecycle: 'draft'`, `slug: <year>`, and inherits org rollout flags (`api_read`, `identity_login`, `d1_write`, `docs/PLATFORM.md:70-76`). Inserts permanent domain `<org>-<year>.konf.run` (`kind: 'platform-edition'`, `verification: 'verified'`). **Does not transfer bare `<org>.konf.run` alias yet**; the alias remains on edition N until N+1 becomes `live`.
3. **Conference D1:** Inserts core row if `d1_write` is enabled (`src/lib/konf-api/conference-write.ts:70`).
4. **Settings copied vs reset:**
   - _Copied:_ Title/slug formatted with year, branding (logos, theme, colors), organizers/roles, topics, formats, sponsor tiers, contract templates, sponsor benefits, and notification channels (`src/lib/conference/edition.ts:316-368`).
   - _Reset:_ Event & CFP dates, ticket integrations/provider keys, proposals, talks, schedule, messages/conversations, photo wall, reminders, and notifications.
5. **Idempotency:** Accepts an `Idempotency-Key` recorded in `provisioning_requests` (`services/tenant-directory/migrations/0001_init.sql:30-33`). Retries return the existing conference `_id`.

## 4. What Archiving Triggers

| Candidate                   | Recommendation    | Rationale                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Read-only admin**         | **Yes**           | Freeze conference settings, CFP submissions, review scoring, and ticket setups. Organizers retain export and view permissions. Break-glass edit requires platform operator.                                                                                                                                           |
| **Frozen programme**        | **Yes**           | Schedule and talk listings lock permanently. Prevents accidental retro-edits to historical records.                                                                                                                                                                                                                   |
| **Retention clocks**        | **Yes**           | Anchors GDPR/privacy cleanup clocks (#254): reminder logs purged 60d post-event (`docs/SPEAKER_REMINDERS.md:146`), persistent notifications purged 90d (`docs/MESSAGING_SYSTEM.md:517`), and talk reviews / speaker messages purged 24mo (`docs/MESSAGING_SYSTEM.md:595`, `docs/SPEAKER_ERASURE_RUNBOOK.md:742-743`). |
| **Sponsor / CRM roll-over** | **Opt-in**        | Do not mutate edition N. Offer an organizer action in Kontroll to copy sponsor contacts and lead statuses into edition N+1's CRM pipeline as renewal leads.                                                                                                                                                           |
| **Domain alias handover**   | **Yes (on live)** | When N archives and N+1 is `live`, bare `<org>.konf.run` and root custom domain move to N+1. Edition N stays at `<org>-<year>.konf.run`. If N archives while N+1 is still `draft`, bare alias serves an archive banner.                                                                                               |
| **Search & SEO**            | **Yes**           | Updates JSON-LD `eventStatus` to `EventEnded` (`src/lib/seo/eventJsonLd.ts:155-156`). Sets canonical URL to permanent year domain so search engines index N+1 on the main domain.                                                                                                                                     |
| **Notifications**           | **Yes**           | Emits persistent notification to org admins: "Edition [N] has been archived." Closes open speaker-organizer message threads (`docs/MESSAGING_SYSTEM.md:50`).                                                                                                                                                          |

## 5. Billing Model & Transition Hooks

_Note: Billing structure is an owner decision. The options below identify architectural hook points without prescribing pricing._

- **Tenant-directory schema today:** Organizations have a `plan` column (`organizations.plan`, default `'free'`, `services/tenant-directory/migrations/0001_init.sql:8`). Conferences have no billing columns.
- **Architectural options:**
  1. _Per-organization subscription (flat fee):_ Plan covers the org. Edition creation and archiving are purely operational; no billing mutations on transition.
  2. _Per-edition fee (event credit):_ Billing mutation hooks into `draft -> live`. Creating a draft is free; publishing `live` consumes an edition credit or charges the org.
  3. _Per-active-edition (concurrency cap):_ Org plan allows $K$ concurrent `live` editions. Hook at `draft -> live` checks active count; `live -> archived` decrements count and frees capacity.
- **Transition enforcement points:** `canPublishEdition(orgId)` evaluates `plan` in tenant-directory before promoting `draft -> live`. Archiving triggers a quota release webhook if usage-metered.

## 6. Phased Rollout & Open Questions for the Owner

### Phased Rollout

1. **Phase 1 (Data & Schema):** Update D1 enum to include `cancelled` in `conferences.lifecycle`. Backfill ended editions (CNDN 2024, 2025) to `archived`. Expose `lifecycle` mutation in tenant-directory GraphQL.
2. **Phase 2 (Create Flow Alignment):** Update `createEdition` to orchestrate Sanity + tenant-directory D1 + conference D1 + rollout flags atomically with idempotency. Keep bare alias on edition N while N+1 is `draft`.
3. **Phase 3 (Archiving Engine):** Implement daily archiving cron (`endDate + 30d`) and trigger archiving when N+1 promotes to `live`. Enforce read-only admin and trigger retention clocks (#254).
4. **Phase 4 (Kontroll & UI):** Add "Publish edition" and "Archive edition" controls in Kontroll and site `/admin`. Wire sponsor CRM roll-over.

### Open Questions for the Owner

1. **Archiving trigger default:** _Auto-archive 30 days after `endDate`, or require human confirmation?_
   - _Recommendation:_ Auto-archive 30 days after `endDate` with email warning at 14 days, plus immediate auto-archive when edition N+1 goes `live`. Provide an organizer "Extend wrap-up (+30d)" button.
2. **Bare domain behavior when N archives before N+1 is live:** _What should `<org>.konf.run` serve during the gap?_
   - _Recommendation:_ Keep routing bare alias to edition N (displaying a "Conference ended — see you next year!" banner) until edition N+1 is published `live`.
3. **Billing model selection:** _Per-org subscription or per-edition fee?_
   - _Recommendation:_ Per-organization subscription with unlimited archived editions and 1 active edition included (charging for additional concurrent live editions).
4. **Aligning D1 and Sanity enums:** _Should tenant-directory `conferences.lifecycle` add `cancelled`?_
   - _Recommendation:_ Yes. Add `cancelled` to D1 `conferences.lifecycle` (`draft | live | archived | cancelled`) so D1 models all non-derivable homepage states without mapping workarounds.
