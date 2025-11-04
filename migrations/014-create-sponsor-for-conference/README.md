# Migration 014: Create sponsorForConference Documents

## Overview

This migration creates `sponsorForConference` documents from existing `conference.sponsors[]` array entries. This enables the new Sponsor CRM functionality while maintaining full backward compatibility with existing sponsor displays on the public website.

## What This Migration Does

1. **Scans all conferences** with sponsors in the `conference.sponsors[]` array
2. **Creates a new `sponsorForConference` document** for each sponsor with:
   - Status: `closed-won` (existing sponsors are considered active)
   - Invoice status: `paid` (assumed paid for existing sponsors)
   - Contract signed date: Conference creation date
   - Contract value & currency: From sponsor tier pricing (if available)
   - Sponsor, conference, and tier references preserved

3. **Preserves the original `conference.sponsors[]` array** - No modifications to existing data
4. **Skips duplicates** - If a `sponsorForConference` already exists for a sponsor+conference pair

## Impact

- **Documents affected**: All conferences with sponsors
- **Estimated new documents**: ~20-100 (depends on number of conferences and sponsors)
- **Breaking changes**: None - fully backward compatible
- **Public website impact**: None - continues using `conference.sponsors[]`

## Prerequisites

### 1. Backup Your Dataset

**CRITICAL**: Always backup before running migrations:

\`\`\bash
npx sanity dataset export production backup-before-014.tar.gz
\`\`\`

### 2. Validate Schema

Ensure new schemas are deployed:

\`\`\`bash
npx sanity documents validate -y
\`\`\`

You should see `sponsorForConference` and `sponsorActivity` as valid document types.

## Running the Migration

### Option 1: Using Sanity Migration Tool (Recommended)

\`\`\`bash
npx sanity migration run 014-create-sponsor-for-conference
\`\`\`

### Option 2: Manual Script

If the Sanity migration tool doesn't work with the custom runner:

\`\`\`bash

# Create a script file

cat > run-migration-014.ts << 'EOF'
import { clientWrite } from './sanity/lib/client'
import { runMigration } from './migrations/014-create-sponsor-for-conference'

async function main() {
try {
const result = await runMigration(clientWrite)
console.log('Migration completed successfully:', result)
process.exit(0)
} catch (error) {
console.error('Migration failed:', error)
process.exit(1)
}
}

main()
EOF

# Run with ts-node

npx ts-node run-migration-014.ts
\`\`\`

## Verification

After running the migration:

### 1. Check Document Counts

\`\`\`bash

# Count sponsorForConference documents

npx sanity documents query '\*[_type == "sponsorForConference"] | count'

# Count total conference sponsors (should match or be close)

npx sanity documents query '\*[_type == "conference"] | {sponsors: count(sponsors)} | sum(sponsors)'
\`\`\`

### 2. Verify Sample Documents

\`\`\`bash

# View a few created documents

npx sanity documents query '\*[\_type == "sponsorForConference"][0...3]{
sponsor->{name},
conference->{title},
tier->{title},
status,
invoice_status,
contract_value,
contract_currency
}'
\`\`\`

### 3. Check CRM Page

1. Navigate to `/admin/sponsors/crm` in your application
2. Verify sponsors appear in the "Closed - Won" column
3. Confirm financial values are correct

## Rollback

If you need to rollback:

### 1. Restore from Backup

\`\`\`bash
npx sanity dataset import backup-before-014.tar.gz production --replace
\`\`\`

### 2. Or Delete Created Documents

\`\`\`bash
npx sanity documents query 'delete \*[_type == "sponsorForConference"]'
\`\`\`

**Note**: Rollback does NOT affect the original `conference.sponsors[]` arrays.

## Post-Migration

### 1. Future Conference Setup

For new conferences, sponsors can be managed via:

- **Legacy method**: Add to `conference.sponsors[]` array (public display)
- **CRM method**: Create `sponsorForConference` documents (pipeline management)
- **Both**: Use both systems in parallel (recommended)

### 2. Existing Sponsor Updates

When updating existing sponsors:

- Changes to `conference.sponsors[]` will reflect on public website
- Changes to `sponsorForConference` documents will reflect in CRM
- Systems are independent - keep both in sync manually or via automation

## Troubleshooting

### Issue: "Type 'sponsorForConference' not found"

**Solution**: Deploy schemas first:
\`\`\`bash

# Schema is deployed automatically with your codebase

# Or manually via Sanity Studio

\`\`\`

### Issue: Migration creates duplicates

**Solution**: The migration checks for existing documents. If duplicates occur:
\`\`\`bash

# Delete duplicates manually

npx sanity documents query '_[_type == "sponsorForConference"] | {
"key": sponsor.\_ref + conference.\_ref,
...
} | [@ in [... | group(@.key)][].items[1..]].\_id | delete _[_id in ^]'
\`\`\`

### Issue: Missing contract values

**Expected**: Not all sponsors have tier pricing (e.g., special/community sponsors). These will have `contract_value: undefined`.

## Notes

- **Performance**: Migration is fast (~1 second per 100 sponsors)
- **Idempotent**: Safe to run multiple times (skips existing documents)
- **Non-destructive**: Original data remains unchanged
- **No downtime**: Public website continues working during migration

## Questions?

Contact the development team or refer to:

- `/docs/README.md` - Project documentation
- Plan file: Sponsor CRM System - Implementation Plan
