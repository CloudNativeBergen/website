# Migration 007: WorkshopSignup Schema Updates

## Overview

This migration updates the `workshopSignup` schema to remove deprecated fields and migrate the cancelled status.

## Changes Made

1. **Remove deprecated cancellation fields:**
   - Removes `cancellationReason` field
   - Removes `cancelledAt` field
   - Note: Cancellation is now handled through the status field being set to 'waitlist'

2. **Migrate signup date field:**
   - Migrates `signupDate` → `signedUpAt` (if `signedUpAt` doesn't exist)
   - Removes the deprecated `signupDate` field

3. **Update status values:**
   - Migrates `status: "cancelled"` → `status: "waitlist"`
   - The new schema only supports 'confirmed' and 'waitlist' statuses

4. **Set default timestamps:**
   - Sets `signedUpAt` to current time if missing (with warning logged)

## Running the Migration

1. **Create a backup** (REQUIRED):

   ```bash
   npx sanity@latest dataset export production backup-before-007-$(date +%Y%m%d).tar.gz
   ```

2. **Dry run** (recommended):

   ```bash
   npx sanity@latest migration run 007-workshopSignup-schema-updates --dry-run
   ```

3. **Execute the migration**:

   ```bash
   npx sanity@latest migration run 007-workshopSignup-schema-updates
   ```

4. **Validate the results**:

   ```bash
   npx sanity@latest documents validate -y
   ```

## Verification

After running the migration, verify:

1. No `workshopSignup` documents have `cancellationReason`, `cancelledAt`, or `signupDate` fields
2. All `workshopSignup` documents have a `signedUpAt` timestamp
3. No documents have `status: "cancelled"` (all should be 'confirmed' or 'waitlist')
4. Documents with `status: "confirmed"` have a `confirmedAt` timestamp

## Rollback

If issues occur, restore from the backup:

```bash
npx sanity@latest dataset import backup-before-007-YYYYMMDD.tar.gz production
```
