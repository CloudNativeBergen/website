# Migration 010: Conference Schema Updates

## Overview

This migration removes the deprecated `coc_link` field from conference documents. The Code of Conduct link has been moved to site-wide configuration.

## Changes

### Removed Fields

- `coc_link` - Deprecated field, now managed in site-wide configuration

## Impact

- Affects 1 conference document with the deprecated `coc_link` field
- This is a cleanup migration only - all functionality has already been migrated

## Dependencies

None

## Validation Notes

After running this migration, the conference validation will show errors for missing required fields (`cfp_email`, `domains`, `formats`, `topics`) on one old conference document (289e80a5-c1ee-400d-9022-b08cccce5a18). These fields should be filled in manually via the Sanity Studio or the document should be archived if it's no longer in use.

## Running the Migration

```bash
npx sanity migration run 010-conference-schema-updates
```
