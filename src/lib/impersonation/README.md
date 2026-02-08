# Impersonation Utilities

This module provides utilities for handling impersonation URL parameters throughout the application.

## Overview

When organizers impersonate speakers, the `?impersonate=<speakerId>` parameter needs to be preserved across navigation. These utilities provide a consistent, type-safe way to handle this requirement.

## Usage

### Client Components (React)

Use the hooks for client components:

```tsx
'use client'

import { useImpersonateQueryString } from '@/lib/impersonation'

export function MyComponent() {
  const queryString = useImpersonateQueryString()

  return <Link href={`/some/path${queryString}`}>Go somewhere</Link>
}
```

### Server Components

Use the utility functions for server components:

```tsx
import { buildUrlWithImpersonation } from '@/lib/impersonation'

export default async function Page() {
  const session = await getAuthSession()

  const backUrl = buildUrlWithImpersonation('/cfp/list', session)

  return <BackLink fallbackUrl={backUrl}>Back</BackLink>
}
```

### Manual URL Construction

If you need more control:

```tsx
import { addImpersonateParam } from '@/lib/impersonation'

const url = addImpersonateParam('/cfp/proposal/123', speakerId)
// Result: /cfp/proposal/123?impersonate=abc123
```

## API Reference

### Hooks (Client Components)

#### `useImpersonateQueryString()`

Returns the complete query string for the current impersonation state.

- **Returns**: `string` - Query string like `"?impersonate=xxx"` or empty string

### Utilities (Server/Client)

#### `buildUrlWithImpersonation(baseUrl, session)`

Builds a URL with impersonate parameter if session is impersonating.

- **Parameters**:
  - `baseUrl: string` - The base URL
  - `session: SessionWithImpersonation | null` - Session object
- **Returns**: `string` - URL with impersonate param if impersonating

#### `addImpersonateParam(baseUrl, speakerId)`

Adds impersonate parameter to any URL.

- **Parameters**:
  - `baseUrl: string` - The base URL
  - `speakerId: string | null` - Speaker ID to impersonate
- **Returns**: `string` - URL with impersonate parameter

#### `getImpersonateQueryString(searchParams)`

Gets query string from URLSearchParams.

- **Parameters**:
  - `searchParams: URLSearchParams | null` - Search params object
- **Returns**: `string` - Query string like `"?impersonate=xxx"`

## Migration Guide

### Before

```tsx
// Client component
const searchParams = useSearchParams()
const impersonateParam = searchParams.get('impersonate')
const queryString = impersonateParam ? `?impersonate=${impersonateParam}` : ''

// Server component
const backUrl = session.isImpersonating
  ? `/cfp/list?impersonate=${session.speaker._id}`
  : '/cfp/list'
```

### After

```tsx
// Client component
import { useImpersonateQueryString } from '@/lib/impersonation'
const queryString = useImpersonateQueryString()

// Server component
import { buildUrlWithImpersonation } from '@/lib/impersonation'
const backUrl = buildUrlWithImpersonation('/cfp/list', session)
```

## Benefits

1. **Type Safety**: All functions are fully typed
2. **Consistency**: One source of truth for impersonation logic
3. **Maintainability**: Changes to impersonation logic happen in one place
4. **Simplicity**: Less boilerplate code
5. **Error Prevention**: Handles edge cases (null checks, URL parsing)

## Examples

See implementations in:

- `/src/components/cfp/CompactProposalList.tsx`
- `/src/components/cfp/CompactWorkshopStats.tsx`
- `/src/app/(speaker)/cfp/proposal/[id]/page.tsx`
- `/src/app/(speaker)/cfp/workshop/[id]/page.tsx`
