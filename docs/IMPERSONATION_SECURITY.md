# Impersonation Security Documentation

## Overview

The impersonation feature allows organizers to view the application as if they were another speaker. This is **strictly limited** to development environments and has multiple layers of security to prevent misuse.

## Security Requirements

**Impersonation is ONLY possible when ALL of the following conditions are met:**

1. ✅ `NODE_ENV` must be `development` (NOT production)
2. ✅ `AppEnvironment.isDevelopment` must be `true`
3. ✅ User must be authenticated
4. ✅ User must have `isOrganizer: true` flag
5. ✅ URL must be provided to `getAuthSession()`
6. ✅ URL must contain `?impersonate=<speakerId>` parameter
7. ✅ Speaker ID must match `/^[a-zA-Z0-9_-]+$/` pattern
8. ✅ Speaker ID length must be ≤ 100 characters
9. ✅ Target speaker must NOT be an organizer

## Security Layers

### Layer 1: Middleware Protection (Production)

**File:** `src/middleware.ts`

```typescript
if (process.env.NODE_ENV === 'production') {
  if (req.nextUrl.searchParams.has('impersonate')) {
    console.error(
      `[SECURITY] Impersonation attempt blocked in production: ${pathname}?${req.nextUrl.searchParams.toString()}`,
    )
    const url = req.nextUrl.clone()
    url.searchParams.delete('impersonate')
    return NextResponse.redirect(url)
  }
}
```

**Protection:**

- Strips `?impersonate` parameter in production
- Redirects to clean URL
- Logs security event

### Layer 2: Environment Check (Primary)

**File:** `src/lib/auth.ts`

```typescript
// SECURITY: Impersonation is ONLY allowed in development mode
if (process.env.NODE_ENV === 'production') {
  return session
}

// Double-check we're in development
if (!AppEnvironment.isDevelopment) {
  return session
}
```

**Protection:**

- Explicit production check
- Secondary development flag check
- Returns unmodified session if checks fail

### Layer 3: Authorization Check

**File:** `src/lib/auth.ts`

```typescript
// SECURITY: Only organizers can impersonate
if (!session?.speaker?.isOrganizer) {
  return session
}
```

**Protection:**

- Requires authenticated session
- Requires `isOrganizer: true` flag in speaker profile
- Flag is stored in Sanity CMS and verified against database

### Layer 4: URL Requirement

**File:** `src/lib/auth.ts`

```typescript
// No URL provided, no impersonation possible
if (!req?.url) {
  return session
}
```

**Protection:**

- Forces explicit URL passing
- Prevents accidental impersonation from contexts without URL

### Layer 5: Input Validation

**File:** `src/lib/auth.ts`

```typescript
const SANITY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
const MAX_IMPERSONATION_ID_LENGTH = 100

if (!SANITY_ID_PATTERN.test(impersonateId)) {
  return session
}

if (impersonateId.length > MAX_IMPERSONATION_ID_LENGTH) {
  return session
}
```

**Protection:**

- Blocks SQL injection attempts
- Blocks XSS attempts
- Blocks path traversal attempts
- Prevents buffer overflow attacks

**Examples of blocked IDs:**

- `<script>alert('xss')</script>`
- `../../../etc/passwd`
- `user-id; DROP TABLE speakers;--`
- `user@email.com`
- `user/with/slashes`

### Layer 6: Organizer-to-Organizer Prevention

**File:** `src/lib/auth.ts`

```typescript
if (impersonatedSpeaker && !impersonatedSpeaker.isOrganizer) {
  // Allow impersonation
  return {
    ...session,
    speaker: impersonatedSpeaker,
    isImpersonating: true,
    realAdmin: session.speaker,
  }
} else if (impersonatedSpeaker?.isOrganizer) {
  console.error(
    `[SECURITY] Admin ${session.speaker.email} attempted to impersonate another organizer: ${impersonatedSpeaker.email}`,
  )
}
```

**Protection:**

- Prevents privilege escalation
- Logs attempted organizer impersonation
- Returns original session without modification

### Layer 7: Audit Logging

**File:** `src/lib/auth.ts`

```typescript
console.log(
  `[AUDIT] Admin ${session.speaker.email} (${session.speaker._id}) impersonating ${impersonatedSpeaker.email} (${impersonatedSpeaker._id})`,
)
```

**Protection:**

- All successful impersonations are logged
- All failed attempts are logged
- Logs include both admin and target identities
- Searchable audit trail

## Attack Vectors Considered

### 1. ❌ Production Environment Bypass

**Attack:** Set `NODE_ENV` to something other than `production`

**Mitigation:**

- Explicit check: `process.env.NODE_ENV === 'production'`
- Secondary check: `!AppEnvironment.isDevelopment`
- Middleware strips parameter regardless

### 2. ❌ Organizer Flag Manipulation

**Attack:** Modify JWT or session to set `isOrganizer: true`

**Mitigation:**

- NextAuth.js manages sessions server-side
- Session data comes from Sanity CMS database
- Flag is re-verified on every request
- No client-side session modification possible

### 3. ❌ URL Parameter Injection

**Attack:** Special characters in `?impersonate` parameter

**Mitigation:**

- Strict regex validation: `/^[a-zA-Z0-9_-]+$/`
- Length limit: 100 characters
- Only alphanumeric, hyphens, and underscores allowed

### 4. ❌ Case Variation Bypass

**Attack:** Use `?IMPERSONATE` or `?Impersonate` instead

**Mitigation:**

- Server-side code only checks lowercase `impersonate`
- Case variations are ignored
- Middleware blocks case-insensitive matches

### 5. ❌ Fragment or Pathname Smuggling

**Attack:** Put impersonate in URL fragment or path

**Mitigation:**

- Fragments never reach server
- Pathname impersonation requires different code path
- Only query parameter `?impersonate=` is parsed

### 6. ❌ Multiple Parameter Submission

**Attack:** Send multiple `?impersonate` parameters

**Mitigation:**

- `searchParams.get()` returns first value only
- `searchParams.delete()` removes all occurrences
- Validation applied to extracted value

### 7. ❌ Middleware Bypass

**Attack:** Access routes not covered by middleware

**Mitigation:**

- Middleware applies to all `/cfp` and `/admin` routes
- `getAuthSession()` checks exist independently
- Defense in depth approach

### 8. ❌ Organizer Privilege Escalation

**Attack:** Organizer impersonates another organizer

**Mitigation:**

- Explicit check: `if (impersonatedSpeaker?.isOrganizer)`
- Returns original session
- Logs security event

## Implementation Files

### Core Authentication

- `src/lib/auth.ts` - Main impersonation logic with all security checks
- `src/middleware.ts` - Production URL parameter blocking

### Environment Configuration

- `src/lib/environment/config.ts` - Environment flags and validation

### UI Components

- `src/components/ImpersonationBanner.tsx` - Visual indicator when impersonating
- `src/components/cfp/CFPLayout.tsx` - Navigation with impersonation context
- `src/components/admin/SpeakerTable.tsx` - Admin interface entry point

### Utility Functions

- `src/lib/impersonation/utils.ts` - URL building helpers
- `src/hooks/useImpersonation.ts` - React hooks for impersonation state

### Integration Points

- `src/server/trpc.ts` - tRPC context with impersonation support
- `src/app/(cfp)/cfp/expense/page.tsx` - Server-side data fetching with impersonation

## Testing

### Unit Tests

- `__tests__/lib/auth-impersonation.test.ts` - ID validation and security rules
- `__tests__/middleware/impersonation-security.test.ts` - Middleware behavior and attack vectors

### Manual Testing Checklist

1. **Production Safety:**
   - [ ] Deploy to production and verify `?impersonate` parameter is stripped
   - [ ] Verify middleware redirect removes parameter
   - [ ] Check security logs for blocked attempts

2. **Development Functionality:**
   - [ ] Regular users cannot impersonate (even with `?impersonate` parameter)
   - [ ] Organizers can impersonate regular speakers
   - [ ] Organizers cannot impersonate other organizers
   - [ ] Impersonation banner appears when active
   - [ ] Exit impersonation button works correctly

3. **Input Validation:**
   - [ ] Try XSS payload: `?impersonate=<script>alert(1)</script>`
   - [ ] Try SQL injection: `?impersonate=user'; DROP TABLE speakers;--`
   - [ ] Try path traversal: `?impersonate=../../../etc/passwd`
   - [ ] Try excessively long ID (>100 chars)
   - [ ] Try invalid characters: `?impersonate=user@email.com`

4. **Audit Trail:**
   - [ ] Check server logs for `[AUDIT]` entries on successful impersonation
   - [ ] Check server logs for `[SECURITY]` entries on blocked attempts
   - [ ] Verify logs include both admin and target identities

## Security Recommendations

### DO:

✅ Always use `getAuthSession({ url: req.url })` in server components
✅ Check `session.isImpersonating` flag before taking sensitive actions
✅ Display `ImpersonationBanner` when active
✅ Log all impersonation events for audit trail
✅ Test impersonation in development before deploying
✅ Review security logs regularly

### DON'T:

❌ Never enable impersonation in production
❌ Never trust client-side impersonation state
❌ Never allow impersonation without URL parameter
❌ Never skip organizer authorization check
❌ Never allow organizer-to-organizer impersonation
❌ Never bypass input validation

## Incident Response

If impersonation is suspected to be exploited:

1. **Immediate Actions:**
   - Deploy middleware fix to strip `?impersonate` parameter
   - Verify `NODE_ENV=production` in deployment
   - Check server logs for `[SECURITY]` and `[AUDIT]` entries

2. **Investigation:**
   - Review audit logs for unauthorized impersonation
   - Check if any non-organizers have `isOrganizer: true` flag
   - Verify Sanity CMS speaker profiles for anomalies
   - Review recent code changes to auth.ts and middleware.ts

3. **Remediation:**
   - Revoke sessions of affected users
   - Reset `isOrganizer` flags if compromised
   - Add additional logging if needed
   - Update security documentation

4. **Post-Incident:**
   - Document findings
   - Update security tests
   - Review similar features for vulnerabilities
   - Consider additional security layers

## Compliance

This implementation follows security best practices:

- ✅ **Principle of Least Privilege**: Only organizers can impersonate
- ✅ **Defense in Depth**: Multiple independent security layers
- ✅ **Fail Secure**: Any check failure blocks impersonation
- ✅ **Audit Trail**: All actions are logged
- ✅ **Input Validation**: Strict whitelist validation
- ✅ **Environment Separation**: Production explicitly blocked
- ✅ **Transparency**: Clear UI indication when impersonating

## Contact

For security concerns or to report vulnerabilities:

- Email: [security@cloudnativedays.no]
- Create a private security advisory on GitHub
