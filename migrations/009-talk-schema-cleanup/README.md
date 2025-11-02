# Migration 009: Talk Schema Cleanup

## Overview

This migration removes deprecated fields from the `talk` schema and migrates workshop capacity field.

## Changes Made

1. **Migrate workshop capacity field:**
   - Migrates `workshopCapacity` → `capacity` (if `capacity` doesn't exist)
   - Removes the deprecated `workshopCapacity` field

2. **Remove deprecated tags field:**
   - Removes `tags` array field
   - Note: Tags have been replaced by the `topics` reference array which provides better structure and reusability

## Migration to New Schema

If you need to preserve tag data:

1. **For tags:** The old `tags` field contained simple string arrays. The new `topics` field uses references to `topic` documents. You should:
   - Create `topic` documents for each unique tag
   - Update talks to reference these topics instead of using string tags
   - This migration will log warnings for talks that have non-empty tags arrays

## Running the Migration

1. **Create a backup** (REQUIRED):

   ```bash
   npx sanity@latest dataset export production backup-before-009-$(date +%Y%m%d).tar.gz
   ```

2. **Review talks with tags** (recommended before migration):

   ```bash
   npx sanity@latest documents query '*[_type == "talk" && defined(tags)] {_id, title, tags}'
   ```

3. **Dry run** (recommended):

   ```bash
   npx sanity@latest migration run 009-talk-schema-cleanup --dry-run
   ```

4. **Execute the migration**:

   ```bash
   npx sanity@latest migration run 009-talk-schema-cleanup
   ```

5. **Validate the results**:

   ```bash
   npx sanity@latest documents validate -y
   ```

## Verification

After running the migration, verify:

1. No `talk` documents have `workshopCapacity` field
2. Workshop talks have `capacity` field set appropriately
3. No `talk` documents have `tags` field
4. Talks are using `topics` references instead

## Rollback

If issues occur, restore from the backup:

```bash
npx sanity@latest dataset import backup-before-009-YYYYMMDD.tar.gz production
```

## Notes

- The migration will log warnings for any talks that have non-empty `tags` arrays
- Review these warnings and manually migrate important tag data to `topics` if needed
- The `tags` field will be removed regardless to align with the current schema
