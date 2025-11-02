# Migration 008: Speaker Schema Cleanup

## Overview

This migration removes deprecated fields from the `speaker` schema that have been replaced by newer, more flexible structures.

## Changes Made

1. **Remove deprecated company field:**
   - Removes `company` field
   - Note: Company information should now be included in the speaker's `title` or `bio` field

2. **Remove deprecated boolean flag fields:**
   - Removes `is_diverse` field
   - Removes `is_first_time` field
   - Removes `is_local` field
   - Note: These are now managed through the `flags` array using standardized flag values

3. **Remove old social media fields:**
   - Removes `github` field
   - Removes `linkedin` field
   - Removes `twitter` field
   - Removes `website` field
   - Note: All social links should now be in the `links` array

## Migration to New Schema

If you need to preserve the data from deprecated fields before running this migration, you should:

1. **For company information:** Manually update speaker profiles to include company in the `title` field (e.g., "Senior Engineer at Company Name")

2. **For flags:** Use the `flags` array with these values:
   - `is_local: true` → Add `"local_speaker"` to flags array
   - `is_first_time: true` → Add `"first_time_speaker"` to flags array
   - `is_diverse: true` → Add `"diverse_speaker"` to flags array

3. **For social media:** Add URLs to the `links` array:
   - GitHub: `https://github.com/username`
   - LinkedIn: `https://linkedin.com/in/username`
   - Twitter: `https://twitter.com/username`
   - Website: `https://example.com`

## Running the Migration

1. **Create a backup** (REQUIRED):

   ```bash
   npx sanity@latest dataset export production backup-before-008-$(date +%Y%m%d).tar.gz
   ```

2. **Dry run** (recommended):

   ```bash
   npx sanity@latest migration run 008-speaker-schema-cleanup --dry-run
   ```

3. **Execute the migration**:

   ```bash
   npx sanity@latest migration run 008-speaker-schema-cleanup
   ```

4. **Validate the results**:

   ```bash
   npx sanity@latest documents validate -y
   ```

## Verification

After running the migration, verify:

1. No `speaker` documents have `company`, `is_diverse`, `is_first_time`, or `is_local` fields
2. No `speaker` documents have `github`, `linkedin`, `twitter`, or `website` fields
3. Speaker data is properly represented in the new schema using `flags` and `links` arrays

## Rollback

If issues occur, restore from the backup:

```bash
npx sanity@latest dataset import backup-before-008-YYYYMMDD.tar.gz production
```
