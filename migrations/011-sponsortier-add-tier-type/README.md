# Migration 011: Add tier_type to Sponsor Tiers

## Overview

This migration adds the required `tier_type` field to sponsor tier documents that are missing it. The field was made required in the schema but some existing documents don't have it set.

## Changes

### Added Fields

- `tier_type` - Set to `'standard'` if the tier has a price, or `'special'` if it doesn't

## Impact

- Affects 3 sponsor tier documents:
  - `6411bac4-2f3b-4f10-a02f-5c78e2383a4f`
  - `88188081-5314-4a5d-998c-eba059907775`
  - `f2809bc9-5932-4fa5-ba68-3e457585dc8c`

## Logic

The migration determines the tier type based on the presence of a price:

- Has price → `tier_type: 'standard'`
- No price → `tier_type: 'special'`

## Dependencies

None

## Running the Migration

```bash
npx sanity migration run 011-sponsortier-add-tier-type
```
