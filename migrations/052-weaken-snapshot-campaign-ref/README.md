# Snapshot preservation before marketing deletion

Run this migration **before enabling Campaign or Plan deletion** against a dataset
with existing marketing snapshots:

```sh
mise run migrate -- 052-weaken-snapshot-campaign-ref
```

Review the Sanity migration dry run and take a dataset backup before applying it.
This migration has not been run from the implementation sandbox.

It backfills campaign key, title, outcome, target and window, plus every per-Task
key, before weakening the stored campaign references. The schema declaration
alone does not change existing references. Existing denormalized metadata is kept
on repeat runs, including a null target.

The migration runs two independent passes.

**Weakening the owner references** goes first and cannot fail. It rewrites every
reference the schema now declares weak — `campaign`, `plan`, `post`, `variant`,
`copiedFrom`, `prerequisites[]` and `perTask[].task` — so that nothing can refuse
a Campaign or plan delete. This is the pass deletion is gated on, and it is
deliberately not downstream of anything that can throw: while it was, a single
unattributable Snapshot could leave every plan permanently undeletable.

**Backfilling the Snapshot metadata** keeps an all-or-nothing contract: all
joins are resolved before any of it is written. A Snapshot whose Campaign no
longer resolves stops that pass — restore the Campaign from a backup rather than
weakening an unattributable reading. A Snapshot with no `campaign` at all (a
half-filled Studio draft) is skipped, and a `perTask` row whose Task is already
gone is kept without a key: `task.delete` predates this migration, so those rows
are expected and there is no key left to recover.

A partial run therefore leaves references weakened and Snapshots un-backfilled.
That is safe and the migration is re-runnable — every write is skipped when the
value is already there.

Drafts and content-release versions are included because their strong references
prevent a delete exactly as a published document's do. After applying, verify
snapshots carry the metadata fields, `campaign._weak: true` and
`perTask[].taskKey` before exposing deletion.
