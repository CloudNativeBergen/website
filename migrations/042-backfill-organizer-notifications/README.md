# Migration 042: Backfill Organizer Notifications (messages + events rail)

## Overview

A one-shot backfill that reconstructs the **organizer side** of the in-app
notification hub, which was **silently never populated** until #559.

### The #559 root cause

From the hub launch until #559, every code path that fanned notifications out to
organizers resolved the organizer set with a query that tested
`isOrganizer == true` — **a field that does not exist on the speaker schema**. It
matched **nothing** in production, so **every organizer-recipient notification
was silently never created**. The maintainer's hub is therefore empty of
organizer history.

#559 fixed the pipe going **forward** (organizers are now resolved by membership
in a conference's `organizers[]` array — the canonical rule the auth session
already uses). This migration reconstructs the missing **history** from the
current dataset state.

Two families of organizer notification were lost, and this migration restores
both:

## PART A — collapsed `message_received` notifications

The live writer `upsertMessageNotifications`
(`src/lib/notification/sanity.ts`) keeps **one collapsed notification per
(recipient, conversation)**: every new message re-surfaces the same document
instead of stacking a new one. Its recipient set includes **every organizer**
(`resolveParticipantIds` always seeds the participant set with the full
organizer list), so each organizer should hold one collapsed message
notification per conversation they participate in — but got none.

For **every conversation** in the target conference that has **at least one
message**, for **every organizer**, this migration creates the collapsed doc
with fields mirroring the live single-message shape exactly:

- `recipient` → the organizer (**weak** ref, per 041)
- `conference` → the conference
- `notificationType` → `message_received`
- `title` → the live single-message form
  `New message from <lastAuthorName> — <subject>`, or the **DIRECT** variant
  `Direct message from <lastAuthorName> — <subject>` when the organizer **is**
  the conversation's `subjectSpeaker` (mirrors the live `isDirect` comparison);
  grapheme-safe, capped at 200
- `message` → the last message body excerpt (~140 chars, grapheme-safe)
- `link` → the **organizer-audience** `conversationLinkPath`
  (`/admin/proposals/<id>#messages` for proposal threads, else
  `/admin/messages/<conversationId>`)
- `actor` → the last message's author (**weak** ref)
- `count` → 1
- `createdAt` → `conversation.lastMessageAt`
- `readAt` → `conversation.lastMessageAt` (**arrives read** — see Read-state)

### The live-id collapse trick (critical)

The document `_id` is the **LIVE deterministic id**
`notification.message.<conversationId>.<organizerId>` — the exact id
`messageNotificationId` computes. The live upsert **patches this same id** on
every subsequent message, so a future message **collapses into the backfilled
document** instead of creating a second one. **No duplicates, ever.** And because
the write is `createIfNotExists`, if a post-#559 message already re-created the
live doc, this migration **no-ops** on it and never clobbers the fresher
(possibly unread) live state.

### Actor-exclusion limitation (honest current-state note)

The backfilled doc mirrors the conversation's **last** message. An organizer who
**authored** that last message is skipped (the live upsert excludes the actor;
otherwise they'd get a nonsensical "New message from _themselves_"). This means a
notification such an organizer may have earned from an **earlier** message in the
same thread is **not** reconstructed — an accepted limitation of reconstructing
from current state only (the same spirit as 040 reconstructing from current
proposal status).

## PART B — events-rail organizer notifications

The events handler `handlePersistNotification`
(`src/lib/events/handlers/persistNotification.ts`) emits **three**
organizer-facing notifications, all targeting `getOrganizerSpeakerIds()` and all
lost to the `isOrganizer` bug. This migration reconstructs each from current
talk state, mirroring the live titles / types / links verbatim:

| Source (current talk state) | `notificationType`        | Title                           | `link`                      | Timestamp used        |
| --------------------------- | ------------------------- | ------------------------------- | --------------------------- | --------------------- |
| status left `draft`\*       | `proposal_submitted`      | `New proposal: "<title>"`       | `/admin/proposals/<talkId>` | talk `_createdAt`     |
| status == `confirmed`       | `proposal_status_changed` | `Speaker confirmed: "<title>"`  | `/admin/proposals/<talkId>` | talk `_updatedAt`\*\* |
| status == `withdrawn`       | `proposal_status_changed` | `Proposal withdrawn: "<title>"` | `/admin/proposals/<talkId>` | talk `_updatedAt`\*\* |

\* "left `draft`" = current `status` ∈ {`submitted`, `accepted`, `waitlisted`,
`confirmed`, `rejected`, `withdrawn`} — any such talk was submitted at least once
(the live `Action.submit` handler would have fired). `draft` and `deleted` are
excluded.

\*\* The talk schema has **no dedicated status-change timestamp**, so `_updatedAt`
is used as the honest best proxy for when the confirm/withdraw happened. For a
withdrawn talk, the `withdrawnReason` becomes the notification `message` (mirrors
the live handler relaying `event.metadata.reason`).

Each doc carries: `recipient` (organizer, **weak**), `conference`,
`notificationType`, `title`, `link`, `relatedProposal` (**weak**, per 040),
`actor` (the talk's first speaker, **weak**), `createdAt` (the source timestamp),
and `readAt == createdAt`. The **actor** is excluded from the organizer
recipients (an organizer who is also that speaker is skipped, mirroring the live
`id !== actorId`).

The `_id` is deterministic:
`notification.backfill-042.<notificationType>.<talkId>.<organizerId>`. A talk is
only ever one of confirmed/withdrawn in current state, so the two
`proposal_status_changed` variants never collide on an id.

## Read-state rule

**Every** backfilled notification (both parts) arrives **already read**
(`readAt == createdAt`). Reconstructed history should populate the panel
chronologically **without lighting up the unread badge** — a flood of historical
unread items would be noise, not signal. (Contrast 040, which deliberately left
`accepted` proposals **unread** because they are still-actionable speaker
call-to-actions; nothing backfilled here is a fresh call-to-action for an
organizer.)

## Target conference

Identical to 040. The app resolves the conference by request domain
(`getConferenceForCurrentDomain`), unavailable inside a migration, so this
migration queries all conferences, picks the one with the **latest `startDate`**,
and **logs every candidate** (the production dataset contains test/dummy
conference docs with far-future `startDate`s that break the naive heuristic). To
pin a specific edition, set `BACKFILL_CONFERENCE_ID=<conferenceId>` in the run
environment — **the maintainer intends to pin it** for the production run.

## Idempotency

Safe to run multiple times. `createIfNotExists` **only** — no patches, no
deletes to any existing document.

1. **Deterministic `_id`s**:
   - PART A → `notification.message.<conversationId>.<organizerId>` (the **live**
     id — see the collapse trick above)
   - PART B → `notification.backfill-042.<type>.<talkId>.<organizerId>`

   A re-run recreates the same ids, so `createIfNotExists` no-ops.

2. **PART B dedup set** (belt-and-braces, like 040) — a pre-pass loads existing
   `notification` documents for the conference of type `proposal_submitted` /
   `proposal_status_changed` and builds a set keyed
   `(recipient, notificationType, relatedProposal)`. A candidate is skipped when
   its key already exists. This catches a **live emitter that already fired**
   post-#559 for the same (organizer, talk, kind) with a **random** `_id` — which
   the deterministic-id check alone would miss — so no duplicate is created.

PART A needs no separate dedup set: the live deterministic id **is** the dedup,
and `createIfNotExists` guarantees the live doc (if any) wins.

Drafts are skipped (the published document owns the fields). Skipped counts are
logged.

## Dry-run friendliness

The migration logs, before writing:

- every **conference candidate** and the chosen target;
- the resolved **organizer count**;
- **PART A** candidate count (`conversations with ≥1 message × organizers`);
- **PART B** source breakdown (talks: submitted / confirmed / withdrawn ×
  organizers) and the existing-key skip count;
- a final summary of created / skipped for each part.

## Running the migration

Run via the **`Run Sanity Migration`** GitHub Actions workflow
(`.github/workflows/run-migration.yml`, `workflow_dispatch`):

- **migration**: `042-backfill-organizer-notifications`
- **dataset**: `production` (or the target dataset)
- pin **`BACKFILL_CONFERENCE_ID`** to the current edition

The workflow exports a dataset backup artifact, performs a **dry run** (logging
every intended creation without writing), and only then applies. Review the
dry-run log before the apply step — it is the validation gate, since the
migration cannot be exercised against the real dataset from a PR.

Equivalent local invocation:

```bash
BACKFILL_CONFERENCE_ID=<conferenceId> pnpm sanity migration run 042-backfill-organizer-notifications \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production   # dry run
BACKFILL_CONFERENCE_ID=<conferenceId> pnpm sanity migration run 042-backfill-organizer-notifications \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production --no-dry-run --no-confirm
```

## Verification

After running, spot-check counts and a sample:

```bash
# PART B backfilled docs (deterministic prefix)
npx sanity documents query '*[_type == "notification" && _id in path("notification.backfill-042.**")] | count'

# PART A collapsed message docs for organizers (live id shape) — all should be read
npx sanity documents query '*[_type == "notification" && notificationType == "message_received" && _id in path("notification.message.**")]{title, readAt, count}[0...10]'
```

## Rollback

```bash
# PART B only (deterministic prefix — safe, these ids are unique to this migration)
npx sanity documents query 'delete *[_type == "notification" && _id in path("notification.backfill-042.**")]'
```

> ⚠ **PART A cannot be blanket-deleted by id prefix**: it shares the LIVE
> `notification.message.*` id space, so a live message may since have collapsed
> into (and updated) a backfilled doc. Deleting by that prefix would destroy live
> notifications too. If PART A must be undone, restore from the backup artifact
> produced by the workflow.
