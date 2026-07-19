# Migration 041: Weaken messaging / notification speaker references

## ⚠️ NOT RUN — maintainer decision required

This migration is committed but **has not been run against any dataset**. Running
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
`sanity/schemaTypes/{message,conversation,notification}.ts`). That fixes new
writes, but **reference strength is stored per ref object** (`_weak`), not on the
schema, so **existing documents keep their strong refs** until rewritten. This
migration rewrites them.

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

After running, confirm no strong messaging refs remain:

```bash
# Should return 0 once the migration has applied.
npx sanity documents query 'count(*[
  (_type == "message" && defined(author._ref) && author._weak != true) ||
  (_type == "conversation" && ((defined(createdBy._ref) && createdBy._weak != true) || (defined(subjectSpeaker._ref) && subjectSpeaker._weak != true))) ||
  (_type == "notification" && ((defined(recipient._ref) && recipient._weak != true) || (defined(actor._ref) && actor._weak != true)))
])'
```

## Rollback

Weak refs are backward compatible (a weak ref resolves exactly like a strong one
for reads), so there is normally nothing to roll back. If required, restore from
the backup artifact produced by the workflow.
