# Migration 016: Deduplicate Attachments and Ensure Unique Keys

## Overview

Fixes duplicate attachment entries in talk documents that occurred due to:

1. Admin video URL re-saves creating duplicate recording attachments
2. Non-unique `_key` values generated with `Date.now()` causing collisions

## What it Does

- **Deduplicates attachments** by unique identifier:
  - URL attachments: deduplicates by `url`
  - File attachments: deduplicates by `file.asset._ref`
- **Keeps the earliest** attachment when duplicates found (by `uploadedAt`)
- **Ensures UUID \_keys**: Replaces timestamp-based keys with proper UUIDs

## Before Running

### 1. Check for Duplicates

```bash
# Count talks with duplicate attachments
npx sanity documents query '
*[_type == "talk" && defined(attachments) && count(attachments) > 1] {
  _id,
  title,
  "attachmentCount": count(attachments),
  "uniqueUrls": count(array::unique(attachments[_type == "urlAttachment"].url)),
  "hasDuplicates": count(attachments) != count(array::unique(attachments[_type == "urlAttachment"].url)) + count(array::unique(attachments[_type == "fileAttachment"].file.asset._ref))
} [hasDuplicates == true]
' | jq 'length'
```

### 2. Backup Dataset

```bash
npx sanity dataset export production backup-before-dedupe-$(date +%Y%m%d).tar.gz
```

## Running the Migration

### Dry Run (Recommended First)

```bash
npx sanity migration run 016-deduplicate-attachments --dry-run
```

Review the output to see what changes will be made.

### Execute Migration

```bash
npx sanity migration run 016-deduplicate-attachments
```

## Verification

### 1. Check for Remaining Duplicates

```bash
npx sanity documents query '
*[_type == "talk" && defined(attachments)] {
  _id,
  title,
  "duplicateUrls": attachments[_type == "urlAttachment"].url[@ in ^.^.attachments[_type == "urlAttachment"].url]
} [count(duplicateUrls) > count(array::unique(duplicateUrls))]
'
```

Should return empty array.

### 2. Verify UUID Keys

```bash
npx sanity documents query '
*[_type == "talk" && defined(attachments)] {
  "badKeys": attachments[!(_key match "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]._key
} [count(badKeys) > 0]
'
```

Should return empty array.

### 3. Check Attachment Counts

```bash
# Before migration
npx sanity documents query '*[_type == "talk"] | { "total": count(attachments[]) } | sum(total)'

# After migration (should be less)
npx sanity documents query '*[_type == "talk"] | { "total": count(attachments[]) } | sum(total)'
```

## Example Output

```text
Migration: 016-deduplicate-attachments (dry-run)
Processing 150 documents...
✓ talk-123: Removed 2 duplicate recording attachments (3 → 1)
✓ talk-456: Replaced timestamp keys with UUIDs
✓ talk-789: No changes needed
...
Summary: 45 documents modified, 105 unchanged
```

## Rollback

If issues occur:

```bash
# Restore from backup
npx sanity dataset import backup-before-dedupe-YYYYMMDD.tar.gz production --missing
```

## Related Code Changes

This migration works in conjunction with code fixes to prevent future duplicates:

- `ProposalPublishedContent.tsx`: Checks if video URL changed before saving
- `proposal.ts` (tRPC router): Checks for duplicate asset refs before upload
- Both locations now use `uuid.v4()` instead of `Date.now()` for `_key` generation
