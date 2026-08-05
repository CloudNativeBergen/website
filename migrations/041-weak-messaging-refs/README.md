# Migration 041: Weaken messaging / notification speaker references

## ✅ APPLIED to production (2026-07-19)

This migration was run against the `production` dataset on 2026-07-19 (maintainer-authorized;
GitHub Actions run 29679682997: backup → dry-run → apply, 24 documents processed,
24 mutations, 1 transaction committed).
Note: `conversation.assignedTo` postdates this migration and has never had strong refs,
so no follow-up backfill is needed for it. (Re-verified 2026-08-05: the one stored
`assignedTo` ref is weak — `src/lib/messaging/sanity.ts` writes it as
`{ ...createReference(id), _weak: true }`.)

## ⚠️ The trap has REOPENED — a re-run is not the fix

Verified against production on 2026-08-05. The migration's own effect held: **no**
strong ref predating the 2026-07-19 run survives. But **802 new strong speaker
references have accumulated since, across 428 documents**, on the very fields this
migration weakened:

| Field                         | Strong refs today | Created before the run |
| ----------------------------- | ----------------: | ---------------------: |
| `notification.recipient`      |               408 |                      0 |
| `notification.actor`          |               373 |                      0 |
| `message.author`              |                13 |                      0 |
| `conversation.createdBy`      |                 7 |                      0 |
| `conversation.subjectSpeaker` |                 1 |                      0 |

Oldest 2026-07-19T17:47Z (nine hours after the run); newest 2026-08-05.

The column sums to 802 **references**, which live in 428 **documents**. The
374-reference difference is made of documents holding two strong refs at once,
measured 2026-08-05 (query (c) below):

- **373** notifications hold a strong `recipient` **and** a strong `actor`
- **1** conversation holds a strong `createdBy` **and** a strong `subjectSpeaker`
- messages contribute **0**: their document and reference counts both measured 13

373 + 1 = 374, and 802 − 428 = 374. The verification queries below report each of
these figures separately — documents, references, and the overlap — so the
reconciliation can be re-run rather than trusted; see "Mind the unit".

**Cause.** Schema `weak: true` governs Studio writes and validation, not API
writes. `createReference()` (`src/lib/sanity/helpers.ts`) returns
`{ _type: 'reference', _ref }` with no `_weak`, so application writes are strong.
In `src/lib/notification/sanity.ts` the same object literal sets `relatedProposal`
weak (with a comment explaining why) while `recipient` and `actor` — the two
speaker refs this migration exists to weaken — are left strong.

**Do not respond by re-running this migration.** It would clear the backlog and
the backlog would rebuild. The fix belongs at the write path; until it lands, the
GDPR erasure trap is open again. Tracked separately from this migration.

Original run instructions kept below for other datasets. Running
it is a deliberate maintainer action via the
[`Run Sanity Migration`](../../.github/workflows/run-migration.yml) workflow
after review.

## Overview

The messaging and notification systems held **strong** references to speakers:

- `message.author`
- `conversation.createdBy`
- `conversation.subjectSpeaker`
- `notification.recipient`
- `notification.actor`

Sanity refuses to delete a document that has inbound **strong** references, so a
speaker who had ever sent a message, created (or was the subject of) a
conversation, or received/triggered a notification could **never be deleted** —
a GDPR erasure trap.

The schema now declares these fields `weak: true` (see the `weak: true` edits in
`sanity/schemaTypes/{message,conversation,notification}.ts`). **Reference strength
is stored per ref object** (`_weak`), not on the schema, so **existing documents
keep their strong refs** until rewritten. This migration rewrites them.

That schema change was assumed to also fix **new** writes. It does not — schema
`weak: true` governs Studio writes and validation, not writes made through the
API. See "The trap has REOPENED" above.

## What it does

Streams every `message`, `conversation`, and `notification` document and, for
each of the fields above that is present and **not already weak**, sets
`_weak: true` on the reference object (preserving `_ref` and any other keys).

It never changes a `_ref` target, never deletes anything, and skips drafts (the
published document owns the fields).

## Idempotency

Safe to run repeatedly: a ref that already carries `_weak: true` is skipped, so a
re-run only touches refs that are still strong. Counts of patched documents and
weakened references are logged.

## Running the migration

Via the **`Run Sanity Migration`** GitHub Actions workflow (`workflow_dispatch`):

- **migration**: `041-weak-messaging-refs`
- **dataset**: `production` (or the target dataset)

The workflow exports a dataset backup artifact, performs a **dry run**, and only
then applies. Review the dry-run log before the apply step.

Equivalent local invocation:

```bash
pnpm sanity migration run 041-weak-messaging-refs \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production   # dry run
pnpm sanity migration run 041-weak-messaging-refs \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production --no-dry-run --no-confirm
```

## Verification

After running, confirm no strong messaging refs remain.

**Both queries below return 0 immediately after an apply, and neither stays 0** —
the write path keeps creating strong refs (see "The trap has REOPENED" above). A
non-zero result today is EXPECTED and is **not** evidence that the migration
failed to apply.

**Mind the unit.** (a) and (b) count different things and are supposed to
disagree: one document can hold two strong refs — a `notification` via
`recipient` + `actor`, a `conversation` via `createdBy` + `subjectSpeaker` — so
the reference total runs ahead of the document total. Query (c) measures that
overlap so the difference can be checked rather than assumed. Measured
2026-08-05: **428 documents** holding **802 references**, none predating the
2026-07-19 run.

```bash
# (a) DOCUMENTS holding at least one strong ref → 428 on 2026-08-05.
npx sanity documents query '{"documents": count(*[
  (_type == "message" && defined(author._ref) && author._weak != true) ||
  (_type == "conversation" && ((defined(createdBy._ref) && createdBy._weak != true) || (defined(subjectSpeaker._ref) && subjectSpeaker._weak != true))) ||
  (_type == "notification" && ((defined(recipient._ref) && recipient._weak != true) || (defined(actor._ref) && actor._weak != true)))
])}'

# (b) REFERENCES per field → 408 + 373 + 13 + 7 + 1 = 802 on 2026-08-05.
npx sanity documents query '{
  "notificationRecipient": count(*[_type == "notification" && !(_id in path("drafts.**")) && defined(recipient._ref) && recipient._weak != true]),
  "notificationActor":     count(*[_type == "notification" && !(_id in path("drafts.**")) && defined(actor._ref) && actor._weak != true]),
  "messageAuthor":         count(*[_type == "message" && !(_id in path("drafts.**")) && defined(author._ref) && author._weak != true]),
  "conversationCreatedBy": count(*[_type == "conversation" && !(_id in path("drafts.**")) && defined(createdBy._ref) && createdBy._weak != true]),
  "conversationSubject":   count(*[_type == "conversation" && !(_id in path("drafts.**")) && defined(subjectSpeaker._ref) && subjectSpeaker._weak != true])
}'

# (c) OVERLAP — documents holding two strong refs at once. This is what makes (b)
#     larger than (a); run it rather than inferring it.
#     On 2026-08-05: notificationBoth 373, conversationBoth 1 → 802 - 428 = 374.
npx sanity documents query '{
  "notificationBoth": count(*[_type == "notification" && !(_id in path("drafts.**")) && defined(recipient._ref) && recipient._weak != true && defined(actor._ref) && actor._weak != true]),
  "conversationBoth": count(*[_type == "conversation" && !(_id in path("drafts.**")) && defined(createdBy._ref) && createdBy._weak != true && defined(subjectSpeaker._ref) && subjectSpeaker._weak != true])
}'
```

**All three are wrapped in `{ … }` deliberately.** A bare `count(…)` evaluating to 0
makes the Sanity CLI fail with `Query returned no results` and exit 1 — so the
success case looks like a broken query. Wrapping the count in an object prints
`{"documents": 0}` instead.

## Rollback

Weak refs are backward compatible (a weak ref resolves exactly like a strong one
for reads), so there is normally nothing to roll back. If required, restore from
the backup artifact produced by the workflow.
