# Snapshot preservation before marketing deletion

Run this migration **before enabling Campaign or Plan deletion** against a dataset
with existing marketing snapshots:

```sh
mise run migrate -- 051-weaken-snapshot-campaign-ref
```

Review the Sanity migration dry run and take a dataset backup before applying it.
This migration has not been run from the implementation sandbox.

It backfills campaign key, title, outcome, target and window, plus every per-Task
key, before weakening the stored campaign references. The schema declaration
alone does not change existing references. Existing denormalized metadata is kept
on repeat runs, including a null target.

All source documents are collected and validated before any mutations are
yielded. A missing or foreign Campaign/Task join stops the migration. Restore the
missing historical source from a backup before rerunning; do not weaken an
incomplete snapshot or invent a Task key. Historical Task references were already
weak, so old manually deleted Tasks may require this recovery even though their
Campaign still exists.

Draft snapshots are included because their strong references can also prevent
deleting a Campaign. After applying, verify snapshots have the metadata fields,
`campaign._weak: true`, and `perTask[].taskKey` before exposing deletion.
