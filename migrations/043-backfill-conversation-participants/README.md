# Migration 043: Backfill conversation participants + message authorParty (party model G1)

## ✅ RUN IN PRODUCTION — 2026-07-19

Applied to the `production` dataset on 2026-07-19 (maintainer-authorized; GitHub
Actions run 29702487495: backup → dry-run → apply, `--no-dry-run --no-confirm`).

The ordering requirement it carried — run after the G1 dual-write shipped and
**before** G2 flips the read path onto `participants[]` — was met, and the G2a
flip has since shipped (see the party-model note in `src/lib/messaging/sanity.ts`).
That instruction is therefore historical: do **not** read it as work still owed.

Do not re-run against `production`. It is idempotent, but a re-run is still an
unnecessary production write. The run instructions below remain valid for
**other datasets**, where running it is a deliberate maintainer action via the
[`Run Sanity Migration`](../../.github/workflows/run-migration.yml) workflow
after review.

## Overview

The messaging **party data model** (G1) introduces a general representation of
"who is on a thread":

- `conversation.participants[]` — a list of `conversationParticipant` parties
  (`speaker` / `sponsor` / `group`);
- `message.authorParty` — the party form of a message's author.

G1 **dual-writes** this representation going forward (`ensureProposalConversation`,
`createGeneralConversation`, `addMessage` in `src/lib/messaging/sanity.ts`), but
documents created **before** the dual-write landed carry only the legacy fields
(`createdBy` / `subjectSpeaker` / `proposal` on a conversation, `author` on a
message). This migration reconstructs the party representation for those
documents from the **same legacy fields the read resolver derives from**, so that
when G2 flips the read path to **prefer** `participants[]`, every historical
thread already carries the bit-identical representation.

## What it does

- **Conversations** (explicit fetch — the proposal-thread derivation needs the
  `proposal->speakers[]` join): for each non-draft conversation **without** a
  non-empty `participants[]`, writes:
  - proposal thread → one `speaker` party per proposal speaker, then the
    `organizers` group;
  - general thread → the creator, then the `subjectSpeaker` (when set), then the
    `organizers` group.
- **Messages** (streamed iterator — `author` is on the document): for each
  non-draft message **without** an `authorParty` and **with** an author ref,
  writes a `speaker` `authorParty`.

Human-pointing references (`speaker`) are written **weak** (`_weak: true`, per
migration 041) so a later GDPR erase never orphan-blocks. The derivation mirrors
`deriveParties` / `partiesToStored` in `src/lib/messaging/sanity.ts` **verbatim**
— the written arrays are exactly what a legacy-only document resolves to, and
exactly what the live dual-write would have produced. Array-item `_key`s are
**deterministic** (`speaker-<ref>`, `group-organizers`) so a dry run and the
apply agree; the live dual-write uses random nanoid keys instead, which is
harmless (keys are array identity only and carry no meaning).

It never touches the legacy fields, never changes a `_ref` target, and never
deletes anything.

## Idempotency

Safe to run repeatedly. A conversation that already carries a non-empty
`participants[]` (a live dual-write, or a previous run) and a message that
already carries an `authorParty` are **skipped**, so a re-run only patches
documents still missing the representation. Drafts are skipped (the published
document owns the fields). Counts of patched/skipped documents are logged.

## Running the migration

Via the **`Run Sanity Migration`** GitHub Actions workflow (`workflow_dispatch`):

- **migration**: `043-backfill-conversation-participants`
- **dataset**: `production` (or the target dataset)

The workflow exports a dataset backup artifact, performs a **dry run**, and only
then applies. Review the dry-run log before the apply step.

Equivalent local invocation:

```bash
pnpm sanity migration run 043-backfill-conversation-participants \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production   # dry run
pnpm sanity migration run 043-backfill-conversation-participants \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production --no-dry-run --no-confirm
```

## Verification

After running, confirm no non-draft conversation lacks participants and no
non-draft message with an author lacks an `authorParty`:

```bash
# Both should return 0 once the migration has applied.
npx sanity documents query 'count(*[_type == "conversation" && !(_id in path("drafts.**")) && count(participants) == 0])'
npx sanity documents query 'count(*[_type == "message" && !(_id in path("drafts.**")) && defined(author._ref) && !defined(authorParty)])'
```

## Rollback

The backfill is additive, so nothing is destroyed by it. But the "inert until
G2" reasoning that once made rollback trivially safe **no longer holds**: the
G2a flip has shipped, so `participants[]` is now the PREFERRED read for
participant/authz resolution (`canAccessConversation`, `resolveParticipantIds`).
Removing the backfilled fields today falls back onto the legacy derivation
rather than being a no-op. Treat rollback as a change to a live read path, not
as housekeeping. If required, restore from the backup artifact produced by the
workflow.
