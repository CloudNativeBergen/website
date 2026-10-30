# Migration 056: Gallery photo times stored as Oslo wall clock labelled UTC

## ⚠️ NOT RUN

Do not run before #1735 is deployed, and read the dry-run log first.

## What and why

Before #1735 the gallery helpers in `src/lib/time.ts` (`exifDateTimeToISO`,
`updateTimeInISO` and friends) took an Oslo wall-clock time and stored it with
a `Z` suffix. The `date` field on `imageGallery` is therefore 1 hour late for
winter photos and 2 hours late for summer photos when the time came from EXIF
or from a manual edit in the admin. Times taken from the file's last-modified
timestamp (`fileTimestampToISO`) or from "now" were real instants and are
correct.

After #1735 the admin reads stored times as Oslo time, so the bad values show
1 to 2 hours late. This migration moves them back.

## Which documents it changes

Nothing on the document records where `date` came from. The migration tells
the sources apart by shape:

| Stored value                   | Source                            | Action |
| ------------------------------ | --------------------------------- | ------ |
| non-zero ms, e.g. `.123Z`      | file timestamp or "now" (correct) | skip   |
| `.000Z`                        | EXIF or manual time edit (wrong)  | shift  |
| any, `_updatedAt` ≥ cutoff     | may have been saved by fixed code | review |
| has `dateBeforeTzFix`          | already migrated                  | skip   |
| id in `GALLERY_TZ_FIX_EXCLUDE` | excluded by the operator          | skip   |

The ms check misfires for a file timestamp that lands exactly on `.000`
(about 1 in 1000, more on filesystems that store whole seconds). Those would
be shifted wrongly. The dry run lists every candidate with its old and new
value, so check suspicious ones and add their ids to `GALLERY_TZ_FIX_EXCLUDE`.

The offset is worked out per photo, at the photo's own Oslo wall-clock time,
so photos on either side of a DST change get the right one.

## Inputs

| Env var                  | Required | Meaning                                                        |
| ------------------------ | -------- | -------------------------------------------------------------- |
| `BACKFILL_CONFERENCE_ID` | yes      | Only this conference's photos (workflow input `conference_id`) |
| `GALLERY_TZ_FIX_CUTOFF`  | yes      | ISO time #1735 went live. Later-edited photos are only listed  |
| `GALLERY_TZ_FIX_EXCLUDE` | no       | Comma-separated `_id`s to leave alone                          |

The workflow only passes `BACKFILL_CONFERENCE_ID`, so run this one locally.

## Running the migration

Dry run (the default; prints `id conference old -> new (offset)` per photo):

```bash
BACKFILL_CONFERENCE_ID=<conference-id> GALLERY_TZ_FIX_CUTOFF=<deploy-time-iso> \
pnpm sanity migration run 056-gallery-photo-time-oslo \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production
```

Apply, after reading the dry run and exporting a backup
(`pnpm sanity dataset export production backup.tar.gz`):

```bash
BACKFILL_CONFERENCE_ID=<conference-id> GALLERY_TZ_FIX_CUTOFF=<deploy-time-iso> \
GALLERY_TZ_FIX_EXCLUDE=<id1>,<id2> \
pnpm sanity migration run 056-gallery-photo-time-oslo \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production --no-dry-run
```

Each patch carries `ifRevision`, so a photo edited between read and write
fails rather than being overwritten. Re-run to pick it up.

## Idempotency

Each patched photo gets `dateBeforeTzFix` (the old value). Photos that have it
are skipped, so a second run changes nothing.

## Undo

Copy `dateBeforeTzFix` back into `date` and unset `dateBeforeTzFix`:

```bash
npx sanity documents query '*[_type == "imageGallery" && defined(dateBeforeTzFix)]{_id, date, dateBeforeTzFix}'
```

Or restore the backup export.
