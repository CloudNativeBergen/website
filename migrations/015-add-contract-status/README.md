# Migration 015: Add contract_status field

## Overview

Adds `contract_status` and `legacy_synced_at` fields to `sponsorForConference` documents with reasonable defaults based on existing `status` and `contract_signed_at` values.

## Changes

### New Fields

- `contract_status` - Contract stage tracking with values:
  - `none` - No contract discussion yet
  - `verbal-agreement` - Verbal commitment received
  - `contract-sent` - Contract sent for signature
  - `contract-signed` - Contract fully executed

- `legacy_synced_at` - Hidden timestamp for tracking last sync to legacy `conference.sponsors[]` array

## Migration Logic

Determines initial `contract_status` based on existing data:

1. **closed-won + contract_signed_at exists** → `contract-signed`
2. **closed-won + no contract_signed_at** → `contract-sent`
3. **negotiating** → `verbal-agreement`
4. **All other statuses** → `none`

Sets `legacy_synced_at` to `null` for all documents (sync will occur on next edit).

## Running the Migration

```bash
npx sanity migration run 015-add-contract-status
```

## Verification

After running:

```bash
npx sanity documents query '*[_type == "sponsorForConference" && !defined(contract_status)]'
```

Should return empty array if migration succeeded.
