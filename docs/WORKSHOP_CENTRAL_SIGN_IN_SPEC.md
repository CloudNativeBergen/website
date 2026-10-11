# Workshop sign-in through one central callback

Decided in a design interview on 2026-10-10 (issue #1311) and checked against the code before writing. Replaces
decisions 3 and 4 of #1293 (a redirect URI per host, kept in step with WorkOS by a reconcile) and
changes decision 6 where it names registration as a reason a host cannot sign in. The current design
is described in [`AUTH.md`](./AUTH.md#workos-authkit-workshops) and
[`DOMAIN_VERIFICATION.md`](./DOMAIN_VERIFICATION.md).

## 1. What changes

Today every host that signs attendees in is its own WorkOS redirect URI, and the application
registers one only for hosts the platform controls (#1306). A tenant on its own domain therefore has
no workshop portal there.

After this work **one platform host is the only WorkOS callback**. A tenant host never receives an
authorization code and is never registered at WorkOS. The platform host finishes the sign-in with
WorkOS and hands the result to the tenant host, which keeps a session of its own. Any host whose
ownership is proven can then carry the portal, a tenant's own domain included.

Unchanged:

- **The login is still one WorkOS account across every conference on the platform.** A login per
  tenant (WorkOS Organizations, or an environment per tenant) is a later decision. #1310 stands.
- **Access is still the ticket match** for this conference (`src/lib/workshop/access.ts`), decided on
  the page and on every procedure that reads or changes an attendee's own signups. Signups keep the `userWorkOSId` key; no data migrates.
- The plan gate, the unavailable page and the resend action (#1295, #1298) stay.
- Organizer and speaker sign-in (NextAuth) is not touched. #688 stays open and adopts the
  destination check of §4 later.

## 2. Hosts and configuration

- **The auth host** is named by `WORKSHOP_AUTH_ORIGIN`, in production `https://auth.konf.app`. It is
  the origin NextAuth's central callback already uses. It serves no conference: it starts a sign-in,
  takes the callback, hands off, and takes the return from a sign-out.
- **Unset**, a host is its own auth host and the hand-off stays on one origin: the start route then
  accepts only its own host as the destination. This is local development and a single-domain
  installation. System status reports the variable.
- WorkOS holds exactly two addresses for the application, added by hand once per environment: the
  redirect URI `<auth origin>/api/auth/callback` and one sign-out redirect on the auth host.
- With the variable set, the auth-host routes answer 404 on every other host, and the tenant-host
  routes answer 404 on the auth host. A tenant host exchanges no code.
- **`WORKOS_COOKIE_PASSWORD` now seals identity** (§5, §6): whoever holds it can issue a session. It
  must be a different value in every environment, and the production value must not be available to
  preview deployments.

## 3. The flow

1. **Tenant host, `/workshop/sign-in` or `/workshop/sign-up`.** The host must pass §4 and its
   conference must have workshops. The route sets a short-lived cookie holding a random value
   (`__Host-` prefix, HttpOnly, `Secure`, `SameSite=Lax`, `Path=/`), and redirects to the auth
   host's start route with the host name, a hash of that value, and the screen.
2. **Auth host, start.** It checks the named host against §4 and that its conference has workshops,
   so a tenant without workshops is never sent to WorkOS. It builds the authorize URL with PKCE and
   carries the host, the conference that claims it and the hash in sealed state. Nothing from the
   query string is trusted later. It also sets a cookie on the auth host that the callback requires,
   so a callback URL completes nothing outside the browser that started.
3. **Auth host, callback.** It verifies state and the cookie from step 2. It then checks again that
   the host passes §4, that the conference claiming it is still the one in state, and that this
   conference still has workshops. Only then does it exchange the code. It stores **no session and no
   WorkOS token**: the SDK's `handleAuth` always saves a session cookie on the callback host, so the
   callback does not use it. It redirects to the tenant host's redeem route with a hand-off token.
4. **Tenant host, redeem.** It accepts the token only when all of these hold: it unseals, it has not
   expired, it names this host and the conference this host resolves to, and the cookie from step 1
   hashes to the value inside it. It checks §4 and that the conference has workshops once more, sets
   the session cookie, clears the step 1 cookie and redirects to `/workshop`. The return path is
   fixed; nothing in the request chooses it. The response is `no-store` and sends no referrer,
   because the token is in the URL.

A refusal on the auth host is a 404. A refusal at redeem sends the attendee to `/workshop` signed
out, with one neutral line that sign-in did not complete. The reason is never shown. A sign-in
started in a second tab replaces the first tab's cookie, so the first to return is refused this way.

## 4. Which hosts may receive a hand-off

One small shared module answers this, and it is the only place the rule lives:

- the host has a verification record that is **proven**. It passes `isAllowlistEligible`
  (`src/lib/domain-verification/policy.ts`) and it is either a host the platform allocated
  (`isPlatformAllocated`) or a record with `method: 'dns-txt'`. `isAllowlistEligible` alone also
  admits a grandfathered record inside its grace period; that is not enough here. This is the proof
  half of today's `isPlatformControlledHost`, without the test of who owns the conference;
- the match is on the **exact hostname**. No wildcard and no suffix match, and the routing matcher is
  not reused;
- the record names the host, and its conference **still claims** it;
- `localhost` qualifies only with `NODE_ENV=development`.

It reads the record live and fails closed on a read error, as `resolveWorkshopSignInHost` does today.
The rule that a host must be platform-controlled, and the requirement that WorkOS holds its callback,
are both gone.

## 5. The hand-off token

- Sealed (authenticated encryption), nothing stored. The key comes from `WORKOS_COOKIE_PASSWORD`
  with a purpose label, so a hand-off token is never accepted as a session and the reverse.
- Valid for about 60 seconds. It names one host and the conference that claimed it when the sign-in
  started, and carries the hash from step 1. A host released and claimed by another conference in
  between is refused.
- It holds what the session needs: WorkOS user ID, email, whether WorkOS reports the email verified,
  name, and the WorkOS session ID.
- It is not single use. Inside its lifetime the same browser could redeem it twice; no other browser
  can, because no other host and no script can set or read the step 1 cookie.

## 6. The session on the tenant host

- Our own sealed cookie: `__Host-` prefix, HttpOnly, `Secure`, `SameSite=Lax`, `Path=/`. The prefix
  makes the browser refuse a `Domain`, so no sibling host under a shared suffix can set or replace
  it, and `WORKOS_COOKIE_DOMAIN` has nothing to widen. Plain-HTTP local development may drop the
  prefix where a browser will not store it.
- It holds the fields of §5 plus the host and the conference it was issued for, and its expiry.
- **Fixed 7 days from sign-in, no renewal.** The expiry inside the seal decides, not the cookie's
  own lifetime.
- Every read checks: it unseals as a session, it has not expired, the host is the request's host, the
  conference is the one the host resolves to, and the host still passes §4. One live record read per
  decision, as today.
- The proxy, the portal page, the tRPC attendee identity and the sign-out action read this session.
  None of them calls the WorkOS SDK. Changing `WORKOS_COOKIE_PASSWORD` signs everyone out.

## 7. Sign-out

Sign-out ends our cookie and the WorkOS login. The tenant host clears its cookie and sends the
browser to the auth host with a sealed request, valid for about 60 seconds, naming the host and the
WorkOS session ID. The auth host checks the request and the host against §4, keeps the host in a
short-lived cookie of its own (`__Host-` prefix), and sends the browser to WorkOS's logout with one
fixed return address. The return route reads the cookie, clears it, checks the host against §4 again
and redirects to that host's front page. With no valid host it shows a plain signed-out page. Nothing
about the tenant has to pass through WorkOS.

## 8. What is removed

Production holds no WorkOS registration made by the application (checked 2026-10-10: 7 domain
records, none with a `redirectUri*` value), so there is nothing to migrate.

- `src/lib/workshop/redirect-uris/`, `scripts/probe-workos-redirect-uris.ts`, and the reconcile hooks
  in the domain sync, the daily sweep, the routers and the cron route.
- `src/lib/domain-verification/platform-controlled.ts` and its uses.
- `src/lib/workshop/sign-in-start.ts` and `sign-in-request.ts` lose their callers in the tenant-host
  slice and go there, not later: the unused-code check would fail on them.
- Every test, helper, fixture and story of the above goes or changes with it.
- `redirectUriStatus`, `redirectUriId` and `redirectUriError` on `domainVerification`, with their
  types and adapters.
- The states of `sign-in-standing.ts` and `sign-in-labels.ts` that describe registration. The
  "Workshop sign-in" line on the domain card and the system-status row keep two outcomes: available,
  or domain not verified.
- The `WORKOS_COOKIE_DOMAIN` guard and its status row, once nothing sets a cookie it could widen.
- `@workos-inc/authkit-nextjs`, if the auth host ends up using only `@workos-inc/node`.

The emailed portal link (the ticket-sold webhook and the resend action) follows the new decision
through `workshopPortalUrl`. `AUTH.md` and `DOMAIN_VERIFICATION.md` are rewritten to match, and so is
`WORKSHOP_SIGN_IN_RUNBOOK.md`, which arrives with #1309 and is written new if that has not merged.
`/privacy` is reviewed: the cookie is now the platform's own, and the shared-login note stays true.

## 9. Known gaps

- Signing out on one host does not end a session the same attendee holds on another conference's
  host. It lasts until its 7 days are over.
- A login deleted or an email changed at WorkOS takes effect on a tenant host only when its session
  ends. Ticket access is not affected: it is decided each time the page or a signup procedure runs.
- The hand-off token is not single use (§5).
- A proven host receives the hand-off for itself, whoever serves it. Whether the auth host asks the
  visitor to confirm before handing off to a host the platform did not allocate is an open decision
  (#1311), taken once the staging proof shows whether a returning visitor is signed in without
  being asked.

## 10. Proof

1. **Local, two origins.** `localhost` and `127.0.0.1` on one dev server act as tenant host and auth
   host against a WorkOS staging environment: sign-in, sign-up, callback, hand-off, session and
   sign-out in a real browser.
2. **HTTPS rehearsal.** A preview deployment with two real hostnames, the staging keys and a sealing
   key of its own, so `Secure` cookies and cross-site redirects are exercised before the merge. The
   rehearsal hostname needs a proven record in the production dataset, which previews read. That
   record is revoked when the rehearsal ends: while it stands, production would hand off to it.
3. **Tests.** Every guard is sabotage-proven, with the real sealing library and the real SDK where
   one is claimed to behave some way.
4. **Production.** One sign-in and sign-out on `2026.cloudnativedays.no` after the merge. Workshop
   registration opens 2026-10-20 08:00 UTC; there is no fallback path once this merges.

Not verified when this was written:

- whether WorkOS accepts a sign-out return address with a query string, or only an exact registered
  one. §7 does not depend on it: the host travels in a cookie on the auth host;
- whether a second sign-in within the WorkOS login's lifetime is silent or shows the form again;
- that WorkOS staging accepts `http://127.0.0.1:<port>` as a redirect URI next to `localhost`. Its
  documentation allows HTTP and loopback addresses in sandbox environments.

## 11. Slices

The slices are stacked and reach `main` together: once any of them is deployed alone, sign-in is
half old and half new. Each is its own pull request into the integration branch, and each passes CI
on its own tree, including the unused-code check, so a slice exports only what one of its routes
reaches.

1. **Auth host: start, callback, hand-off (#1313).** The sealing module, the destination check of §4, the
   start route and the callback, with `WORKSHOP_AUTH_ORIGIN`.
2. **Tenant host: redeem and the session (#1314).** The sign-in and sign-up routes start at the auth host;
   the redeem route; the proxy, the page, tRPC and the client components read our session.
3. **Sign-out (#1315)** through the auth host (§7).
4. **Removal and documents (#1316)** (§8), the status rows and labels, the runbook and `/privacy`.
