# Migration 040: Backfill Notification Hub (2026 speaker inbox state)

## Overview

A one-shot backfill that seeds the in-app **notification hub** with the CURRENT
2026 state, so speaker inboxes are not empty when the hub launches.

The live emitters
(`src/lib/events/handlers/persistNotification.ts` and
`src/server/routers/travelSupport.ts`) only fan notifications out **going
forward**, from the moment they shipped. Every proposal decision and travel
support decision made **before** the hub existed produced no notification. This
migration reconstructs those notifications from the current dataset so a speaker
opening the inbox at launch sees the decisions that matter to them.

## What this migration does

It resolves the **target conference** (see below) and then creates one
`notification` document per relevant record:

1. **Proposal decisions** — for every `talk` referencing the conference whose
   `status` is a speaker-facing decision
   (`accepted`, `confirmed`, `rejected`, `waitlisted`), one
   `proposal_status_changed` notification is created **for each referenced
   speaker**:
   - `recipient` → the speaker, `conference` → the conference
   - `title` mirrors the live handler wording:
     - accepted → `Your proposal "<title>" is now accepted`
     - rejected → `Your proposal "<title>" is now rejected`
     - waitlisted → `Your proposal "<title>" is now waitlisted`
     - confirmed → `Proposal confirmed: "<title>"` (the live system has **no**
       speaker-facing confirmed title, because confirm is speaker-initiated, so
       one is minted here)
   - `link` → `/cfp/proposal/<talkId>`
   - `relatedProposal` → weak reference to the talk
2. **Travel support decisions** — for every `travelSupport` referencing the
   conference whose `status` is a decision (`approved`, `paid`, `rejected`),
   one `travel_support_update` notification is created for the requesting
   speaker. Titles mirror `TRAVEL_STATUS_NOTIFY_TITLES` in
   `src/server/routers/travelSupport.ts`
   (`Travel support approved` / `Travel support rejected` /
   `Travel support marked paid`), `link` → `/cfp/expense`.

`createdAt` is the backfill run time for every created document.

## Read-state rule

Backfilled notifications arrive **already read** (`readAt == createdAt`) with a
single deliberate exception:

- **`accepted` proposals arrive UNREAD** (no `readAt`). An accepted proposal is
  awaiting the speaker's confirmation, so it is a genuine, still-actionable
  call-to-action and should light up the unread badge.
- Every other proposal state (`confirmed` / `rejected` / `waitlisted`) and **all**
  travel support decisions are informational history, so they arrive read and do
  not inflate the unread count.

## No organizer backfill (deliberate)

This migration intentionally creates **no** organizer-facing notifications
(e.g. `proposal_submitted` "new proposal" or "new travel support request"
notes). Those are transient work-queue signals whose value is at the moment of
submission; reconstructing a pile of historical "new proposal" notifications
would spam organizer inboxes with stale, non-actionable items. Only
speaker-facing decision outcomes are backfilled.

## Target conference

The app resolves the conference by request domain
(`getConferenceForCurrentDomain`), which is not available inside a migration.
This migration therefore queries all conferences and picks the one with the
**latest `startDate`** — the current 2026 edition — and **logs the choice**. To
pin a specific edition, set `BACKFILL_CONFERENCE_ID=<conferenceId>` in the run
environment.

## Idempotency

Safe to run multiple times. Two layers:

1. **Deterministic `_id`s** applied via `createIfNotExists`:
   - proposals → `notification.backfill-2026.<talkId>.<speakerId>`
   - travel → `notification.backfill-2026.travel.<travelSupportId>`

   A re-run recreates the same ids, so `createIfNotExists` no-ops.

2. **Dedup set** (belt-and-braces) — a pre-pass loads existing `notification`
   documents for the conference and builds a set keyed by
   `(recipient, notificationType, relatedProposal | link)`. A candidate is
   skipped when its key already exists. This catches the case where a **live
   emitter has already fired** for the same (speaker, decision) with a random
   `_id` — which the deterministic-id check alone would miss — so no duplicate
   is created. Skipped counts are logged.

Drafts are skipped (the published document owns the fields).

## Running the migration

Run via the **`Run Sanity Migration`** GitHub Actions workflow
(`.github/workflows/run-migration.yml`, `workflow_dispatch`):

- **migration**: `040-backfill-notifications-2026`
- **dataset**: `production` (or the target dataset)

The workflow exports a dataset backup artifact, performs a **dry run** (logging
every intended creation without writing), and only then applies the migration.
Review the dry-run log before the apply step — it is the validation gate, since
the migration cannot be exercised against the real dataset from a PR.

Equivalent local invocation:

```bash
pnpm sanity migration run 040-backfill-notifications-2026 \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production   # dry run
pnpm sanity migration run 040-backfill-notifications-2026 \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production --no-dry-run --no-confirm
```

## Verification

After running, spot-check counts and a sample:

```bash
# Count backfilled notifications
npx sanity documents query '*[_type == "notification" && _id in path("notification.backfill-2026.**")] | count'

# Confirm accepted proposals are unread and others are read
npx sanity documents query '*[_type == "notification" && _id in path("notification.backfill-2026.**")]{title, readAt}[0...10]'
```

## Rollback

```bash
# Delete only the documents this migration created (deterministic id prefix)
npx sanity documents query 'delete *[_type == "notification" && _id in path("notification.backfill-2026.**")]'
```

Or restore from the backup artifact produced by the workflow.
