# Migration 013: Add confirmedAt to Workshop Signups

## Overview

This migration adds the required `confirmedAt` timestamp to workshop signup documents with `status: 'confirmed'` that are missing this field. The schema was updated to require this field for confirmed signups, but existing documents don't have it.

## Changes

### Added Fields

- `confirmedAt` - Set to `signedUpAt` if available, otherwise uses `_createdAt`

## Impact

- Affects ~180 workshop signup documents with `status: 'confirmed'` but missing `confirmedAt`

## Logic

For each confirmed signup without `confirmedAt`:

1. Use `signedUpAt` timestamp if present
2. Fall back to `_createdAt` if `signedUpAt` is not available
3. Set `confirmedAt` to this timestamp

This approach assumes that signups were historically confirmed immediately upon creation, which matches the previous behavior before the `confirmedAt` field was added.

## Validation

After running this migration, all workshop signups with `status: 'confirmed'` should have a `confirmedAt` timestamp, satisfying the schema validation requirement.

## Dependencies

Should be run after migration 007 (workshopSignup schema updates) which introduced the `signedUpAt` field.

## Running the Migration

```bash
npx sanity migration run 013-workshopsignup-add-confirmed-at
```
