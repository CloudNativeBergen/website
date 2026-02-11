# tRPC Server Architecture

## Overview

The Cloud Native Days Norway website uses tRPC to provide type-safe, end-to-end APIs with React Query integration. This document outlines the architecture, patterns, and best practices for implementing tRPC routes.

## Architecture

### Directory Structure

```text
src/
├── server/
│   ├── routers/           # tRPC route definitions
│   │   └── sponsor.ts     # Feature-specific routers
│   ├── schemas/           # Zod validation schemas
│   │   └── sponsor.ts     # Input validation schemas
│   └── trpc.ts           # tRPC configuration and procedures
```

### Core Components

1. **Router Definition** - Feature-specific API routes
2. **Input Schemas** - Zod validation for type safety
3. **Procedure Types** - Query vs Mutation definitions
4. **Error Handling** - Consistent error responses
5. **Client Integration** - React Query hooks

## Best Practices

### Router Organization

```typescript
// Feature-based router structure
export const sponsorRouter = router({
  // CRUD operations
  list: adminProcedure.input(SearchSchema).query(...),
  getById: adminProcedure.input(IdSchema).query(...),
  create: adminProcedure.input(CreateSchema).mutation(...),
  update: adminProcedure.input(UpdateSchema).mutation(...),
  delete: adminProcedure.input(IdSchema).mutation(...),

  // Nested operations
  tiers: router({
    list: adminProcedure.query(...),
    create: adminProcedure.input(TierSchema).mutation(...),
  }),
})
```

### Input Validation

```typescript
// Use Zod for runtime validation
const SponsorInputSchema = z.object({
  name: z.string().min(1).max(100),
  website: z.string().url(),
  logo: z.string(),
  orgNumber: z.string().optional(),
})

// Extend base schemas for updates
const SponsorUpdateSchema = SponsorInputSchema.partial()
```

### Error Handling

```typescript
// Consistent error handling pattern
try {
  const { data, error } = await serviceFunction(input)

  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Operation failed',
      cause: error,
    })
  }

  if (!data) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Resource not found',
    })
  }

  return data
} catch (error) {
  if (error instanceof TRPCError) throw error

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Unexpected error',
    cause: error,
  })
}
```

### Procedure Types

**Queries** - Read operations, cacheable:

```typescript
getById: adminProcedure.input(IdParamSchema).query(async ({ input }) => {
  // Return data
})
```

**Mutations** - Write operations, not cached:

```typescript
create: adminProcedure.input(CreateSchema).mutation(async ({ input }) => {
  // Modify data
  return { success: true }
})
```

## Integration Patterns

### Service Layer Integration

```typescript
// Import existing service functions
import { createSponsor, updateSponsor } from '@/lib/sponsor/sanity'

// Validate input, call service, handle errors
create: adminProcedure.input(SponsorInputSchema).mutation(async ({ input }) => {
  const validationErrors = validateSponsor(input)
  if (validationErrors.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid input',
      cause: { validationErrors },
    })
  }

  const { sponsor, error } = await createSponsor(input)
  // Handle response...
})
```

### Client-Side Usage

```typescript
// Basic queries - automatic caching and refetching
const { data: sponsors, isLoading, error } = api.sponsor.list.useQuery()

// Mutations with UI updates
const removeMutation = api.sponsor.crm.delete.useMutation({
  onSuccess: () => {
    showNotification({ type: 'success', message: 'Sponsor removed' })
    // React Query automatically invalidates related queries
  },
  onError: (error) => {
    showNotification({ type: 'error', message: error.message })
  },
})

// Calling mutations (use _sfcId from ConferenceSponsor)
await removeMutation.mutateAsync({ id: sponsorForConference._id })

// Conditional queries
const { data: tiers } = api.sponsor.tiers.list.useQuery(
  undefined, // no input needed
  { enabled: !!conferenceId }, // only run if conference exists
)
```

### Client Integration Notes

- **Automatic Type Safety**: Full TypeScript inference from server to client
- **React Query Features**: Caching, background updates, error retry built-in
- **Error Handling**: TRPCError objects with structured error information
- **Loading States**: Built-in `isLoading`, `isPending`, `isError` states

## Authentication & Authorization

```typescript
// Protected procedures
const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user?.isOrganizer) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next()
})
```

## Performance Considerations

### Query Optimization

- Use selective field queries in service layer
- Implement proper indexing in Sanity
- Cache frequently accessed data

### Error Boundaries

- Wrap service calls in try-catch blocks
- Provide meaningful error messages
- Log errors for debugging

## Testing Strategy

````typescript
## Testing Strategy

```typescript
// Test tRPC procedures directly
import { createTRPCMsw } from 'msw-trpc'
import { sponsorRouter } from '@/server/routers/sponsor'

const trpcMsw = createTRPCMsw(sponsorRouter)

// Mock responses
trpcMsw.sponsor.list.query(() => [mockSponsor])
````

## Common Patterns

### Partial Updates

```typescript
// Merge with existing data for validation
update: adminProcedure
  .input(IdParamSchema.extend({ data: UpdateSchema }))
  .mutation(async ({ input }) => {
    const existing = await getExisting(input.id)
    const merged = { ...existing, ...input.data }

    // Validate merged data
    const errors = validate(merged)
    if (errors.length > 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', cause: { errors } })
    }

    return await updateResource(input.id, merged)
  })
```

### Conference Context

```typescript
// Get current conference for scoped operations
const { conference, error } = await getConferenceForCurrentDomain()
if (error || !conference) {
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Failed to get current conference',
    cause: error,
  })
}
```

## Migration Guidelines

### From REST to tRPC

1. **Identify API endpoints** - Group by feature/domain
2. **Create input schemas** - Convert request validation to Zod
3. **Map to procedures** - GET → query, POST/PUT/DELETE → mutation
4. **Update client calls** - Replace fetch with tRPC hooks
5. **Test thoroughly** - Ensure type safety and error handling

### Benefits Achieved

- **Type Safety** - Compile-time error detection
- **Developer Experience** - Auto-completion and IntelliSense
- **Validation** - Runtime input validation with Zod
- **Caching** - Automatic React Query integration
- **Error Handling** - Consistent error format

## Troubleshooting

### Common Issues

- **Type mismatches** - Ensure schema alignment
- **Validation failures** - Check Zod schema definitions
- **Authentication errors** - Verify procedure protection
- **Cache issues** - Use React Query DevTools

### Debug Tools

- TanStack Query DevTools
- TypeScript compiler errors
- tRPC error logging
- Network request inspection
