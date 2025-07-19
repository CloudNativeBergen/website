# Sanity Helpers

This module provides generic, reusable helper functions for working with Sanity CMS data, ensuring consistency across all schema-specific modules.

## Key Features

- **Generic and Schema-Agnostic**: All helpers work with any document type and field structure
- **Consistent `_key` Management**: Ensures all array items have the required `_key` attributes
- **Error Handling**: Standardized error responses and try-catch patterns
- **Reduced Duplication**: Single source of truth for common Sanity operations

## Core Functions

### Array Management

#### `generateKey(prefix?: string)`

Generates unique `_key` values for Sanity array items.

#### `ensureArrayKeys<T>(array: T[], prefix?: string)`

Ensures all items in an array have `_key` properties.

#### `prepareArrayWithKeys<T>(items?: T[], prefix?: string)`

Prepares any array with `_key` properties. Returns `undefined` if input is invalid.

#### `prepareReferenceArray<T>(items?: T[], prefix?: string)`

Specifically handles arrays of references, converting `{ _id }` objects to proper Sanity references with `_key`.

### Reference Management

#### `createReference(id: string)`

Creates a standard Sanity reference object.

#### `createReferenceWithKey(id: string, prefix?: string)`

Creates a Sanity reference with a `_key` property.

### Generic Operations

#### `addReferenceToArray(documentId, arrayField, referenceId, additionalData?, keyPrefix?)`

Adds a reference to an array field in any document type.

#### `removeReferenceFromArray(documentId, arrayField, referenceId, keyPrefix?)`

Removes a reference from an array field in any document type.

#### `fixArrayKeys(documentType, arrayFields)`

Fixes missing `_key` attributes in arrays for any document type.

### Error Handling

#### `SanityResponse<T>`

Standardized response type with optional `data` and `error` properties.

#### `withErrorHandling<T>(operation: () => Promise<T>)`

Wraps async operations with consistent error handling.

## Usage Examples

### Basic Array Preparation

```typescript
import {
  prepareArrayWithKeys,
  prepareReferenceArray,
} from '@/lib/sanity/helpers'

// For any array with objects
const itemsWithKeys = prepareArrayWithKeys(items, 'item')

// For reference arrays (speakers, topics, etc.)
const speakersWithKeys = prepareReferenceArray(speakers, 'speaker')
```

### Fixing Existing Data

```typescript
import { fixArrayKeys } from '@/lib/sanity/helpers'

// Fix missing _key attributes for any document type
const result = await fixArrayKeys('talk', [
  { field: 'speakers', prefix: 'speaker' },
  { field: 'topics', prefix: 'topic' },
])
```

### Array Management

```typescript
import {
  addReferenceToArray,
  removeReferenceFromArray,
} from '@/lib/sanity/helpers'

// Add a sponsor to a conference
await addReferenceToArray(
  conferenceId,
  'sponsors',
  sponsorId,
  {
    sponsor: createReference(sponsorId),
    tier: createReference(tierId),
  },
  'sponsor',
)

// Remove a speaker from a proposal
await removeReferenceFromArray(proposalId, 'speakers', speakerId, 'speaker')
```

## Migration Guide

When updating existing schema-specific functions to use these helpers:

1. **Replace schema-specific array preparers**: Use `prepareArrayWithKeys()` instead of `preparePriceArray()`, `preparePerksArray()`, etc.
2. **Replace reference preparers**: Use `prepareReferenceArray()` instead of `prepareSpeakersArray()`, etc.
3. **Replace custom fix functions**: Use `fixArrayKeys()` with appropriate parameters
4. **Use generic array operations**: Replace custom add/remove functions with `addReferenceToArray()` and `removeReferenceFromArray()`

## Benefits

- **Consistency**: All schemas use the same patterns
- **Maintainability**: Changes to core logic only need to be made in one place
- **Type Safety**: Generic types ensure proper TypeScript support
- **Error Handling**: Standardized error responses across all operations
