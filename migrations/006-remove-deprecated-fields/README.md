# Migration 006: Remove Deprecated Fields

## Overview

This migration removes the deprecated `speaker` and `video` fields from talk documents after ensuring the data has been migrated to the new `speakers` array and `attachments` array respectively.

## Prerequisites

**CRITICAL**: Before running this migration, ensure that migrations 004 and 005 have been successfully executed:

1. **Migration 004** (`speaker-to-speakers`): Migrates the single `speaker` reference to a `speakers` array
2. **Migration 005** (`video-to-attachments`): Migrates the `video` URL to the `attachments` array

## What This Migration Does

This migration performs the following operations:

1. **Removes `speaker` field**: Removes the deprecated single speaker reference if:
   - The talk has a `speaker` field
   - The talk has a populated `speakers` array (validation from migration 004)

2. **Removes `video` field**: Removes the deprecated video URL if:
   - The talk has a `video` field
   - The talk has video attachments in the `attachments` array (validation from migration 005)

## Warnings

The migration will log warnings for any talks that have deprecated fields but missing the migrated data:

- If a talk has `speaker` but no `speakers` array
- If a talk has `video` but no video attachments

These warnings indicate that migrations 004 or 005 may not have run correctly and should be investigated before proceeding.

## Running the Migration

1. **Create a backup** (REQUIRED):

   ```bash
   npx sanity@latest dataset export production backup-before-006-$(date +%Y%m%d).tar.gz
   ```

2. **Dry run** (recommended):

   ```bash
   npx sanity@latest migration run 006-remove-deprecated-fields --dry-run
   ```

3. **Execute the migration**:

   ```bash
   npx sanity@latest migration run 006-remove-deprecated-fields
   ```

4. **Validate the results**:

   ```bash
   npx sanity@latest documents validate -y
   ```

## Verification

After running the migration, verify:

1. No talk documents have a `speaker` field (check in Sanity Studio)
2. No talk documents have a `video` field (check in Sanity Studio)
3. All talks have a `speakers` array with at least one speaker
4. All talks that had videos now have corresponding attachments

## Rollback

If issues occur, restore from the backup:

```bash
npx sanity@latest dataset import backup-before-006-YYYYMMDD.tar.gz production
```

## Schema Changes

After this migration completes successfully, the deprecated fields can be safely removed from the talk schema (`sanity/schemaTypes/talk.ts`).
