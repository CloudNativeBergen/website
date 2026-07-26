# tRPC Server Architecture

## Overview

The Cloud Native Days Norway website uses tRPC to provide type-safe, end-to-end APIs with React Query integration. This document outlines the architecture, patterns, and best practices for implementing tRPC routes.

## Architecture

### Directory Structure

```text
src/
├── server/
│   ├── _app.ts            # Root router composing all feature routers
│   ├── routers/            # tRPC route definitions (13 routers)
│   │   ├── badge.ts        # OpenBadges verification + admin sub-router
│   │   ├── featured.ts     # Featured talks & speakers (admin sub-router)
│   │   ├── gallery.ts      # Photo gallery + admin sub-router
│   │   ├── proposal.ts     # CFP proposals + admin & invitation sub-routers
│   │   ├── registration.ts # Attendee registration
│   │   ├── schedule.ts     # Schedule management
│   │   ├── signing.ts      # Contract signing
│   │   ├── speaker.ts      # Speaker profiles + admin sub-router
│   │   ├── sponsor.ts      # Sponsors + tiers, crm, emailTemplates, contractTemplates sub-routers
│   │   ├── tickets.ts      # Ticket management (admin sub-router)
│   │   ├── travelSupport.ts # Travel support + admin sub-router
│   │   ├── volunteer.ts    # Volunteer signups + admin sub-router
│   │   └── workshop.ts     # Workshop management + admin sub-router
│   ├── schemas/            # Zod validation schemas
│   │   ├── common.ts       # Shared schemas (IdParamSchema, etc.)
│   │   ├── speaker.ts      # Speaker input/update schemas
│   │   ├── sponsor.ts      # Sponsor input/update schemas
│   │   ├── proposal.ts     # Proposal schemas
│   │   └── ...             # Per-feature schemas
│   └── trpc.ts             # tRPC configuration, context, procedures
├── lib/
│   └── trpc/
│       └── client.ts       # React Query + tRPC client setup
```

### Core Components

1. **Router Definition** - Feature-specific API routes
2. **Input Schemas** - Zod validation for type safety
3. **Procedure Types** - Query vs Mutation definitions
4. **Error Handling** - Consistent error responses
5. **Client Integration** - React Query hooks

## Best Practices

### Router Organization

One router per domain, registered in `src/server/_app.ts`. All routers with admin operations use a standardized `admin` sub-router to separate organizer-only procedures from user-facing ones:

```typescript
export const speakerRouter = router({
  // Top-level: user-facing procedures (protectedProcedure / publicProcedure)
  getCurrent: protectedProcedure.query(...),
  update: protectedProcedure.input(SpeakerInputSchema).mutation(...),

  // admin sub-router: organizer-only operations (adminProcedure)
  admin: router({
    list: adminProcedure.query(...),
    search: adminProcedure.input(...).query(...),
    getById: adminProcedure.input(IdParamSchema).query(...),
    create: adminProcedure.input(...).mutation(...),
    update: adminProcedure.input(...).mutation(...),
    delete: adminProcedure.input(IdParamSchema).mutation(...),
    sendEmail: adminProcedure.input(...).mutation(...),
  }),
})
```

**All 10 routers with admin procedures use this pattern:** badge, featured, gallery, proposal, speaker, tickets, travelSupport, volunteer, workshop. The sponsor router uses domain-specific sub-routers (tiers, crm, emailTemplates, contractTemplates) instead. Three routers stay flat: registration (2 admin ops), signing (0 admin), schedule (1 admin).

### Naming Conventions

**Routers** — singular noun, camelCase: `speaker`, `proposal`, `sponsor`, `travelSupport`.

**Sub-routers** — group related operations under a descriptive key:

| Pattern             | Example                          | Purpose                            |
| ------------------- | -------------------------------- | ---------------------------------- |
| `admin`             | `speaker.admin.list`             | Organizer-only CRUD and management |
| `crm`               | `sponsor.crm.sendEmail`          | CRM-specific operations            |
| `tiers`             | `sponsor.tiers.create`           | Domain sub-entity management       |
| `invitation`        | `proposal.invitation.send`       | Feature-specific workflows         |
| `activities`        | `sponsor.crm.activities.list`    | Nested sub-entities                |
| `emailTemplates`    | `sponsor.emailTemplates.list`    | Configuration management           |
| `contractTemplates` | `sponsor.contractTemplates.list` | Template management                |

**Procedures** — use verb or verb+noun, camelCase:

| Convention       | Examples                        | When to use                   |
| ---------------- | ------------------------------- | ----------------------------- |
| `list`           | `speaker.admin.list`            | List collections              |
| `getById`        | `speaker.admin.getById`         | Fetch single entity by ID     |
| `getCurrent`     | `speaker.getCurrent`            | Fetch entity for current user |
| `create`         | `sponsor.create`                | Create new entity             |
| `update`         | `proposal.update`               | Update existing entity        |
| `delete`         | `sponsor.tiers.delete`          | Delete entity                 |
| `search`         | `proposal.admin.search`         | Search/filter operations      |
| `sendEmail`      | `speaker.admin.sendEmail`       | Action-oriented operations    |
| `broadcastEmail` | `sponsor.crm.broadcastEmail`    | Specific action variant       |
| `syncAudience`   | `sponsor.crm.syncAudience`      | Synchronization operations    |
| `submitReview`   | `proposal.admin.submitReview`   | Domain-specific actions       |
| `nextUnreviewed` | `proposal.admin.nextUnreviewed` | Navigation/workflow queries   |

**Do not** duplicate procedure names at different levels. If `speaker` has a top-level `updateEmail` (for the current user) and the admin sub-router also has `updateEmail` (for any speaker), that is acceptable because the auth context differs.

### Procedure Type Selection

| HTTP Method (REST) | tRPC Type  | Examples                                  |
| ------------------ | ---------- | ----------------------------------------- |
| GET                | `query`    | `list`, `getById`, `search`, `getCurrent` |
| POST, PUT, DELETE  | `mutation` | `create`, `update`, `delete`, `sendEmail` |

Use `query` for idempotent reads. Use `mutation` for anything that changes state, sends emails, or has side effects.

````

### Conference Resolution

This site is multi-tenant — each conference runs on its own subdomain. The server must determine which conference the request is for, and **this must always happen server-side**.

**Rule: Never accept `conferenceId` as client input in tRPC procedures.** Instead, use `resolveConferenceId()` from `/src/server/trpc.ts`, which derives the conference from the request's `Host` header via `getConferenceForCurrentDomain()`.

```typescript
// ✅ Correct — resolve server-side
import { resolveConferenceId } from '../trpc'

list: adminProcedure.query(async () => {
  const conferenceId = await resolveConferenceId()
  // use conferenceId for queries...
})

// ❌ Wrong — never accept conferenceId from client
list: adminProcedure
  .input(z.object({ conferenceId: z.string() }))
  .query(async ({ input }) => {
    // DO NOT DO THIS — clients could access other conferences
  })
````

**Why:** Accepting `conferenceId` from the client breaks multi-tenant isolation. A malicious or misconfigured client could pass a different conference's ID and access data it shouldn't. Server-side resolution guarantees each request only accesses data belonging to the conference identified by the domain.

**When you need the full conference object** (not just the ID), import and call `getConferenceForCurrentDomain()` directly.

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

Three procedure tiers defined in `src/server/trpc.ts`:

```typescript
// No auth — public data
publicProcedure

// Requires session.speaker._id — any authenticated user
protectedProcedure

// Requires org-scoped organizer of the request's org — organizer-only
adminProcedure
```

The context is created in `createTRPCContext()` which calls `getAuthSession()`, supporting both cookie-based sessions (browser) and Bearer tokens (CLI). After `requireAuth` middleware, `ctx.speaker` and `ctx.user` are guaranteed non-null. Access `ctx.session!` when you need the full session (e.g., `session.account`).

**Rule:** All admin operations use `adminProcedure`. There is no separate REST middleware — tRPC handles auth entirely.

### Org-scoped organizer authorization (CaaS T1-2, #614)

`adminProcedure` is **the authorization waist**: every admin endpoint inherits a
single org-scoped organizer check from the `requireAdmin` middleware — **do not
re-gate individual endpoints.**

**The model.** A user is an organizer _of an organization_ iff they are in the
`organizers[]` of any of **that org's** conferences. This is computed at login
and baked into the session token as `speaker.organizerOrgIds` (the deduped set of
`organization._ref`s of the conferences whose `organizers[]` contain the
speaker — see `ORGANIZER_ORG_IDS_FIELD` in `src/lib/speaker/sanity.ts` and
`applySpeakerToToken` in `src/lib/auth.ts`).

**The request's org** is always resolved server-side from the **domain
conference** via `resolveOrganizationId()` (mirrors `resolveConferenceId()` but
returns `null` instead of throwing) — **never** from client input. The waist then
requires `organizerOrgIds` to include that org id (`isOrganizerForOrg` in
`src/lib/authz/organizer.ts`). It **fails closed**: a resolvable org whose id is
not in the caller's set is denied (`FORBIDDEN`), including a cross-org organizer.

**The legacy bridge.** When the request's org **cannot** be resolved
(pre-`044`-backfill conference without an `organization`, or an unknown domain),
the check falls back to the **deprecated global** `speaker.isOrganizer` boolean
(organizer of _any_ conference) and emits a `console.warn('[authz-bridge] …')`.
This is a deliberate, temporary migration bridge so the org tier can roll out
without locking legitimate organizers out; a resolution _throw_ also maps to the
bridge rather than erroring the waist.

**Removal condition.** Delete the bridge (make an unresolvable org **deny**) once
every live conference has an `organization` **and** every issued token carries
`organizerOrgIds` (all pre-#614 tokens expired / all users re-logged-in). At that
point `resolveOrganizationId() === null` should produce `FORBIDDEN`, and the
deprecated `isOrganizer` field (plus its UI reads) can be removed.

**Shared gates.** Handler/layout/route-handler gates that previously read
`session.speaker.isOrganizer` (the `(admin)` layout, admin server actions'
`requireOrganizer`, the `/launch` dispatcher, the `speaker-image` / `gallery` /
`adobe-sign` / upload API routes, the `(cfp)` organizer-view pages, and the
dev-only impersonation gate in `src/lib/auth.ts`) all go through the **same**
`isOrganizerForOrg` / `isOrganizerForCurrentOrg` helpers with the **same** bridge.
UI components still read the deprecated `isOrganizer` boolean this wave (a
follow-up rewrites them).

## Performance Considerations

### Query Optimization

- Use selective field queries in service layer
- Implement proper indexing in Sanity
- Cache frequently accessed data

### Error Boundaries

- Wrap service calls in try-catch blocks
- Provide meaningful error messages
- Log errors for debugging

## Testing

### Server-Side: Caller Tests

Test procedures directly using `createCallerFactory` from `__tests__/helpers/trpc.ts`:

```typescript
import {
  createAdminCaller,
  createAuthenticatedCaller,
  createAnonymousCaller,
} from '../../helpers/trpc'
import { TRPCError } from '@trpc/server'

describe('speaker.generateCliToken', () => {
  it('returns a token for an authenticated user', async () => {
    const caller = createAuthenticatedCaller()
    const result = await caller.speaker.generateCliToken()
    expect(result).toHaveProperty('token')
    expect(result.token.length).toBeGreaterThan(0)
  })

  it('throws UNAUTHORIZED when not authenticated', async () => {
    const caller = createAnonymousCaller()
    await expect(caller.speaker.generateCliToken()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})
```

Three caller helpers are available:

- `createAnonymousCaller()` — no session, tests public procedures and auth rejection
- `createAuthenticatedCaller(speakerId?)` — authenticated speaker, non-organizer by default
- `createAdminCaller()` — authenticated organizer

### Client-Side: Component Tests

Mock the tRPC client module when testing components that use tRPC hooks:

```typescript
const mockMutateAsync = vi.fn()

vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: {
      generateCliToken: {
        useMutation: () => ({ mutateAsync: mockMutateAsync }),
      },
    },
  },
}))

// In tests:
mockMutateAsync.mockResolvedValue({ token: 'jwt-token', expiresAt: '...' })
```

### Storybook: MSW Handlers

Stories mock tRPC via MSW with the tRPC response envelope format:

```typescript
import { http, HttpResponse } from 'msw'

// Success — wrap in { result: { data } }
http.post('/api/trpc/speaker.admin.sendEmail', () => {
  return HttpResponse.json({
    result: { data: { success: true, sentCount: 5 } },
  })
})

// Error — wrap in { error: { message, code, data } }
http.post('/api/trpc/volunteer.create', () => {
  return HttpResponse.json(
    {
      error: {
        message: 'Already exists',
        code: -32603,
        data: { code: 'CONFLICT' },
      },
    },
    { status: 409 },
  )
})

// Queries use GET
http.get('/api/trpc/registration.validate', () => {
  return HttpResponse.json({
    result: { data: { valid: true } },
  })
})
```

The URL pattern is `/api/trpc/{router}.{procedure}` with dot-separated sub-routers (e.g., `/api/trpc/sponsor.crm.sendEmail`). The `TRPCDecorator` in `.storybook/decorators/` provides the tRPC provider context using `httpLink` (not batch) so each call becomes a separate HTTP request that MSW can intercept.

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

## Migration Learnings

### What Stays as REST

Not everything should be tRPC. These stay as REST route handlers:

- **OAuth callbacks** — NextAuth/WorkOS need full request/response control
- **Webhooks** — External services (Adobe Sign, Checkin) POST to fixed URLs
- **Cron jobs** — Vercel cron triggers specific route paths
- **Binary/streaming** — Image proxying, OpenBadges JWT endpoints
- **File uploads** — FormData multipart requires REST (Vercel Blob SDK, speaker images, gallery)

### Migration Checklist

When migrating a REST route to tRPC:

1. **Read the route handler** — identify auth checks, input parsing, business logic, response shape
2. **Pick the right router** — add to existing feature router, not a new one
3. **Pick the right sub-router** — `admin` for organizer ops (standardized across all routers), domain-specific (`crm`, `tiers`) only for sponsor
4. **Choose procedure type** — `adminProcedure` for organizer-only, `protectedProcedure` for authenticated users
5. **Convert input validation** — `req.body` → Zod schema in `.input()`. Do not use `.passthrough()` on schemas that feed typed interfaces
6. **Handle service return types** — if the existing service returns `Response` objects (REST-oriented), check `.ok` and throw `TRPCError` on failure
7. **Update all callers** — components: `api.{router}.{procedure}.useMutation()`, hooks: same, tests: caller pattern
8. **Update storybook stories** — MSW handlers must use `/api/trpc/{router}.{procedure}` with tRPC response envelope
9. **Delete the REST route** — remove `route.ts` and `client.ts` files
10. **Run `pnpm run check`** — catches unused exports (knip), lint errors, type errors in one pass
11. **Clean up dead code** — remove helper functions, types, and files that were only used by the deleted REST routes

### Common Pitfalls

- **`.next/types` cache** — after deleting route files, `rm -rf .next/types` before typecheck or you get phantom errors
- **Zod `.passthrough()`** — creates index signature `[key: string]: unknown` that is incompatible with typed interfaces. Remove it
- **REST services returning `Response`** — functions like `sendBroadcastEmail()` return `Response` objects. In tRPC procedures, check `response.ok` and throw `TRPCError` instead of returning the Response
- **Knip catches orphans** — after migration, run knip to find newly unused exports, types, and files. Remove them immediately
- **Session context** — `protectedProcedure` provides `ctx.speaker` and `ctx.user` directly, but for `ctx.session.account` you need `ctx.session!` (non-null assertion is safe after auth middleware)

## Troubleshooting

- **Type mismatches after adding procedures** — restart the TS server (`Ctrl+Shift+P` → "Restart TS Server") to pick up new router types
- **Storybook tRPC errors** — ensure the story renders within the `TRPCDecorator` (applied globally in preview). Mutation hooks initialize without making requests — they only fire on `mutateAsync()`
- **"Cannot read properties of null"** — component is missing `QueryClientProvider`/tRPC provider. In tests, mock `@/lib/trpc/client` instead of setting up providers
- **MSW handler not intercepting** — check the URL matches exactly: `/api/trpc/{router}.{sub}.{procedure}`. Use `httpLink` (not `httpBatchLink`) in storybook so each call is a separate request
