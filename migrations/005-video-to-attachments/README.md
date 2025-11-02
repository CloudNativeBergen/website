# Migration: Video to Attachments Array

## Overview

This migration converts the single `video` URL field in talk documents to a `urlAttachment` in the `attachments` array to support multiple types of attachments (slides, recordings, resources).

## What it does

- Converts existing `video` field values to `urlAttachment` objects in the `attachments` array
- Sets the attachment type to `'recording'` and adds a title "Session Recording"
- Preserves the original `video` field for backward compatibility during rollout
- Skips talks that don't have a video URL
- Skips talks that already have their video in the attachments array

## Before running

1. **Create a backup of your dataset:**

   ```bash
   npx sanity@latest dataset export production my-backup-filename.tar.gz
   ```

2. **Validate your documents:**

   ```bash
   npx sanity@latest documents validate -y
   ```

3. **Deploy the new schema:**
   - Ensure `sanity/schemaTypes/attachment.ts` is deployed
   - Ensure `talk.ts` includes the `attachments` field

## Running the migration

```bash
npx sanity@latest migration run 005-video-to-attachments
```

## Schema changes

The migration adds a new `attachments` array field that contains:

```typescript
attachments: [
  {
    _type: 'urlAttachment',
    _key: string,
    url: string,
    attachmentType: 'recording' | 'slides' | 'resource',
    title?: string,
    description?: string,
    uploadedAt?: string
  },
  {
    _type: 'fileAttachment',
    _key: string,
    file: { asset: { _ref: string, _type: 'reference' } },
    attachmentType: 'recording' | 'slides' | 'resource',
    title?: string,
    description?: string,
    filename?: string,
    uploadedAt?: string
  }
]
```

## Code changes

### Read operations

Update code that reads the `video` field to check `attachments` first:

```typescript
// Old
const videoUrl = talk.video

// New - with fallback
const videoUrl =
  talk.attachments?.find(
    (a) => a._type === 'urlAttachment' && a.attachmentType === 'recording',
  )?.url || talk.video
```

### Display components

Use the new `AttachmentDisplay` component to show all attachments including videos:

```typescript
import { AttachmentDisplay } from '@/components/proposal/AttachmentDisplay'

<AttachmentDisplay
  attachments={proposal.attachments || []}
  showVideos={true}
/>
```

### Queries

Update Sanity GROQ queries to include the attachments field:

```groq
*[_type == "talk"]{
  ...,
  video,
  attachments
}
```

## Rollback plan

If you need to rollback:

1. The original `video` field is preserved, so no data is lost
2. Update the schema to hide the `attachments` field
3. Revert code changes to use the `video` field
4. Optionally, you can remove the `attachments` data with another migration if needed

## Post-migration

After verifying the migration worked correctly:

1. Monitor that all video embeds display correctly on public pages
2. Test that admin users can manage attachments
3. Test that speakers can upload slides and add resource links
4. After a grace period (e.g., 2 weeks), consider deprecating the `video` field in the schema

## Notes

- This is an additive migration - it doesn't remove the old `video` field
- The migration is idempotent - it can be run multiple times safely
- Videos added through the new attachment system will not update the old `video` field
- Consider the `video` field deprecated after this migration
