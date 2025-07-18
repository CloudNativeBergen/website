# Migration: Speaker to Speakers Array

## Overview

This migration converts the single `speaker` reference field in talk documents to a `speakers` array field to support multiple speakers per proposal.

## What it does

- Converts the existing `speaker` field (single reference) to `speakers` field (array of references)
- Preserves all existing speaker data by wrapping the single speaker reference in an array
- Removes the old `speaker` field after migration

## Before running

1. Create a backup of your dataset:

   ```bash
   npx sanity@latest dataset export production my-backup-filename.tar.gz
   ```

2. Validate your documents:
   ```bash
   npx sanity@latest documents validate -y
   ```

## Running the migration

```bash
npx sanity@latest migration run 004-speaker-to-speakers
```

## Schema changes

After running this migration, you'll need to update your schema to use the new `speakers` field instead of `speaker`.

## Code changes

All code references to `proposal.speaker` need to be updated to handle `proposal.speakers` as an array.
