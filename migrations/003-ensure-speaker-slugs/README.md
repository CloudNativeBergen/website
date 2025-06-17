# Speaker Slug Migration

This migration ensures all speaker documents in Sanity have properly generated slug fields.

## Overview

The migration is located at `migrations/ensure-speaker-slugs/index.ts` and uses Sanity's official migration system to safely update speaker documents that are missing slug fields.

## Running the Migration

### Prerequisites

1. **Backup your dataset** (strongly recommended):

   ```bash
   npx sanity@latest dataset export production speaker-slugs-backup.tar.gz
   ```

2. **Validate your documents**:

   ```bash
   npx sanity@latest documents validate -y
   ```

### Execute the Migration

```bash
npx sanity@latest migration run ensure-speaker-slugs
```

## What the Migration Does

1. **Identifies** all speaker documents without slug fields
2. **Generates** slugs based on speaker names using the same pattern as the Sanity schema:
   - Converts names to lowercase
   - Replaces spaces with hyphens
   - Truncates to 96 characters maximum
3. **Updates** documents using Sanity's atomic operations
4. **Logs** all changes for audit purposes

## Safety Features

- **Non-destructive**: Only adds slug fields, never modifies existing data
- **Idempotent**: Can be run multiple times safely (skips speakers that already have slugs)
- **Atomic**: Uses Sanity's migration system for safe, transactional updates
- **Detailed logging**: Provides clear feedback on what changes are made

## Post-Migration

After running the migration:

1. **New speakers** will automatically get slugs when created through authentication
2. **Existing speakers** will have proper slugs for URL generation
3. **Speaker URLs** will work correctly in the application

## Rollback

If you need to rollback:

1. Restore from the backup you created:

   ```bash
   npx sanity@latest dataset import speaker-slugs-backup.tar.gz production --replace
   ```

## Related Files

- Migration: `migrations/ensure-speaker-slugs/index.ts`
- Speaker creation logic: `src/lib/speaker/sanity.ts`
- Speaker schema: `sanity/schemaTypes/speaker.ts`
- Documentation: `docs/SPEAKER_MANAGEMENT.md`
