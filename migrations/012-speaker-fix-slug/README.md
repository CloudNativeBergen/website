# Migration 012: Fix Speaker Slug Format

## Overview

This migration fixes speaker documents where the `slug` field is incorrectly stored as a string instead of a proper slug object with `_type` and `current` properties.

## Changes

### Fixed Fields

- `slug` - Converts from string to proper object format:
  - Before: `"some-slug-string"`
  - After: `{ _type: 'slug', current: 'some-slug-string' }`

## Impact

- Affects 1 speaker document:
  - `0acc96fb-b8d7-41e0-ac32-62e915ba6898`

## Validation

The Sanity schema expects slug fields to be objects with:

```typescript
{
  _type: 'slug',
  current: string
}
```

This migration ensures all speaker slugs match this expected format.

## Dependencies

None

## Running the Migration

```bash
npx sanity migration run 012-speaker-fix-slug
```
