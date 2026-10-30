# 057: CNDB 2024 gallery photos to the event day

Cloud Native Day Bergen 2024 ran on 30 October 2024. Its 293 gallery photos
were dated 6–7 November, which is when they were imported, not when they were
taken. This migration moves each photo to 30 October 2024 and keeps its Oslo
clock time, as the organizers decided. Run it after
[056](../056-gallery-photo-time-oslo/).

## Dry run

```sh
BACKFILL_CONFERENCE_ID=0d9747cd-e128-4698-8ba7-3dfd4029d692 \
pnpm sanity migration run 057-cndb-2024-gallery-event-day --project "$SANITY_STUDIO_PROJECT_ID" --dataset production
```

## Apply

Export a backup first (`sanity dataset export production backup.tar.gz --types imageGallery --no-assets`),
then add `--no-dry-run`.

## Undo

Each moved photo keeps its previous value in `dateBeforeEventDayFix`. Copy it
back into `date` and unset the field, or restore the backup.
