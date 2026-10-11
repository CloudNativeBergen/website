# Workshop Sign-in Runbook

How the attendee workshop portal (`/workshop`) gets sign-in on a host, and what
to check when it does not. The design is in
[AUTH.md](AUTH.md#workos-authkit-workshops) and the design record in
[WORKSHOP_CENTRAL_SIGN_IN_SPEC.md](WORKSHOP_CENTRAL_SIGN_IN_SPEC.md). The rule
for hosts is in
[DOMAIN_VERIFICATION.md](DOMAIN_VERIFICATION.md#workshop-sign-in-which-hosts-receive-a-hand-off).

## What has to be true

Attendees can sign in on a host when all of these hold:

1. **The conference has workshops.** The organization's plan includes them and
   its ticketing can read tickets for this conference, or an operator has
   switched them on with a feature override
   (`isWorkshopsEnabledForConference`).
2. **The host's domain is verified.** It is a host the platform provided (for
   example `<name>.konf.run`), or a domain of the organizer's own whose TXT
   proof has resolved. A domain admitted without proof when verification
   shipped (grandfathered) is not enough, even inside its grace period.
3. **The deployment has its sign-in host set up**, once per environment (see
   "Operator: one-time setup" below). Nothing is registered at WorkOS per
   conference host.

Attendees sign in on the conference's host through the platform's one sign-in
host (`WORKSHOP_AUTH_ORIGIN`; this platform's production deployment is
configured with `https://auth.konf.app`), which is the only address WorkOS
calls back to. A tenant host is never a WorkOS callback: the WorkOS
environment is shared by every tenant, so its registered addresses stay on a
host the platform operates.

Local development is the exception to 2: with `NODE_ENV=development`,
`localhost` carries the portal without a verification record. See
[AUTH.md](AUTH.md#workos-workshops-only).

The conference's **main host** decides the most: the first entry of its
domains that is a real hostname (a wildcard or blank entry is skipped;
`findOutboundOrigin` in `src/lib/conference/baseUrl.ts`). Ticket emails link
to the portal on it, and another host of the conference that cannot sign in
sends attendees there when the main host can.

## Organizer: the portal on a new domain

Everything is on **Admin → Settings**, in the domain verification card. Each
domain has a "Workshop sign-in" line, shown when the conference has workshops.
It has two outcomes: **available**, or **domain not verified**.

### A host the platform provided

Nothing to do. The line reads **available** as soon as the host is allocated
and the conference has workshops. The organization document is cached here, so
a plan changed from the control panel can take a while to show.

### A domain of your own

1. Add the domain to the conference's domains.
2. Publish the TXT record the card shows at your DNS provider. Its name is
   `_konf-challenge.<domain>` and its value starts with
   `konf-domain-verification=`.
3. Press **Check now**. When the check finds the record, the domain reads
   **Verified** and the line goes from **domain not verified** to
   **available**. There is nothing further to wait for.
4. Put it first among the domains if attendees should be sent there.

While your own domain is the main host and not yet verified, ticket emails go
out without the portal link and "Resend sign-up instructions" stays disabled.
Attendees can still sign up at the portal on any other verified host of the
conference if you send them that address yourself.

### After the line turns available

Tickets sold before that moment got an email without the portal link, or no
workshop email at all if workshops were off at the time. On
**Admin → Workshops**, press **Resend sign-up instructions** once. Every
workshop ticket holder gets the instructions with the link. A second press
within the hour is normally refused; that is a guard against a double click,
kept per running instance, not a strict limit. The action is refused once
workshop registration has closed.

### What attendees see until then

"Workshop sign-up for (conference) is not available yet", with the conference's
contact address, or "has closed" once workshop registration has ended. The
reason is never shown to them.

## Operator: a host cannot sign in

Start at **Admin → Settings → System status** on the affected conference. Three
things there matter:

- the row `WORKSHOP_AUTH_ORIGIN`, for the deployment;
- the row `WORKOS_CLIENT_ID`, for the deployment;
- one row per host, named `Workshop sign-in: <host>`. The domain card shows the
  same wording.

That page is open only to organizers of the conference's organization. A
platform operator who is not one of them cannot open it. Without that access,
read the host's record from a checkout of this repository, with a Sanity CLI
login that can read the dataset the deployment uses (a read; it writes
nothing):

```
npx sanity documents query '*[_type == "domainVerification" && hostname == "<host>"][0]{hostname, "conference": conference._ref, status, method, graceUntil, lastSuccessAt, lastError}'
```

The row is built from this record, but the record is not the row. The row also
depends on the platform's current domain suffix and on today's date, so do not
derive the row from the fields. Read them for what they say, and ask an
organizer of that organization for the row itself. The fields are defined in
`sanity/schemaTypes/domainVerification.ts`:

- `conference` is the conference currently claiming the hostname. A record
  held by another conference says nothing about this one.
- `status` is the state the verification policy keeps for the claim: `pending`
  (never proven), `verified`, `failing` (a check found no proof) or `revoked`
  (the claim was released). It is not the result of the latest check: a
  verified domain can stay `verified` through failed lookups.
- `lastSuccessAt` is when the claim was last counted as proven. For a
  `dns-txt` record that is a DNS check that found the TXT record. A
  `grandfathered` or `platform-owned` record gets it without any lookup, and
  starts out `verified` the same way. `lastError` is what the last failed
  check reported; a successful check clears it.
- `method` is the kind of proof the record is held to, not whether it has been
  given: `dns-txt` (the DNS TXT challenge, also on a new claim that is still
  `pending`), `grandfathered` (a claim from before verification existed,
  trusted only until `graceUntil`) or `platform-owned` (a subdomain the
  platform allocated).

An empty answer can mean two things: the host has no record, or the CLI is not
signed in, which is reported to answer the same way instead of naming the
missing login (see `AGENTS.md`). Check the login before concluding that there
is no record. The record does not show whether the conference has workshops or
how the deployment is configured; check those on the organization and in
system status.

**What the log says.** Five steps leave one line in the deployment's log when
they refuse, `[workshop] <step> refused: <reason>` (`logRefusal` in
`src/lib/workshop/central-sign-in/decision.ts`): the start route on the
sign-in host (`start`), the callback (`callback`), the redeem route on the
conference's host (`redeem`), the sign-out route on the sign-in host
(`sign-out`) and its return route (`signed-out`).

On the sign-in host `host-refused` is the whole decision: the request is not
on the host `WORKSHOP_AUTH_ORIGIN` names, the variable cannot be used, the host
asked for is not verified, its record could not be read, or (for `start` and
`callback` only) its conference has no workshops. Two of these also write a
line of their own: an unusable variable logs
`[workshop] WORKSHOP_AUTH_ORIGIN is not a bare https origin of a hostname; workshop sign-in is refused on every host.`
and a record that could not be read logs
`[domain-verification] destination read failed; refusing the host`.

A failed code exchange at the callback logs
`[workshop] the code exchange failed; nothing handed off` with a description
of the failure: for an answer from WorkOS its name, codes, status and request
ID (not its message or body), otherwise the error's name and message.

These answer without a refusal line: the sign-out route answering Next's own
fetch of a same-host redirect (the `RSC` header, a 404), the return route on a
host that is not the sign-in host (a 404), `/workshop/sign-in`,
`/workshop/sign-up` and `/workshop/redeem` on the sign-in host (a 404),
`/workshop/sign-in` and `/workshop/sign-up` on a conference without workshops
(a 404), and the same two routes on a host that may not sign in (a redirect
back to `/workshop`). The attendee is never told the reason.

| Symptom                                                                  | What to look at                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | What to do                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `Workshop sign-in` row                                                | The conference does not have workshops, or has no host to report: no domain, or only wildcard and development entries.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Check the organization's plan and feature overrides, that its ticketing is connected for this conference, and the conference's domains.                                                                                                                                             |
| One row, **unknown**, no host                                            | The hosts could not be read. The detail is the error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Reload. If it stays, look at the Sanity read errors in the logs.                                                                                                                                                                                                                    |
| **domain not verified**                                                  | No verification record, the proof has not resolved, it has gone stale, or the record is only grandfathered. For a platform host: the record is `platform-owned` but the host is not under the deployment's `PLATFORM_DOMAIN_SUFFIX`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `dig +short TXT _konf-challenge.<host>` must return the value on the domain card. Then press **Check now**. For a platform host, check `PLATFORM_DOMAIN_SUFFIX` in the deployment.                                                                                                  |
| "Sign In" sends the browser straight back to `/workshop`                 | The conference's host may not sign in: the domain is not verified, its record could not be read, or `WORKSHOP_AUTH_ORIGIN` cannot be used. This step writes no refusal line; the last two write the errors named above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Read the host's row and the `WORKSHOP_AUTH_ORIGIN` row.                                                                                                                                                                                                                             |
| **available**, but attendees see "not available yet" on that host        | `WORKSHOP_AUTH_ORIGIN` reads **invalid**: every host is refused, that row says so, and the log repeats it on every decision. Or verification records cannot be read: the log says `destination read failed`, every host is refused while that lasts, attendees see "not available yet" ("has closed" once workshop registration has ended) whether or not they hold a session, system status shows one **unknown** row in place of the per-host rows if its own read fails too, and sessions work again once reads do.                                                                                                                                                                                                                                    | Set the variable to a bare `https` origin and redeploy. The per-host rows do not reflect this variable; the `WORKSHOP_AUTH_ORIGIN` row does. For a read failure, check Sanity.                                                                                                      |
| `WORKSHOP_AUTH_ORIGIN` reads **not set** with a warning                  | Every host signs attendees in on itself, so each one needs its own two addresses at WorkOS. Right only for a single-domain installation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Set it to the platform's sign-in host and register that host's two addresses (below), or register each host's own `https://<host>/api/auth/callback` and `https://<host>/api/auth/workshop/signed-out`.                                                                             |
| `WORKSHOP_AUTH_ORIGIN` shows an error about the conference's own domains | The conference's domains serve the host the variable names, by name or by a wildcard that covers it. The sign-in host serves no conference, so the portal is not available on that host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Give the sign-in host a hostname no conference claims, or remove that domain or wildcard from the conference.                                                                                                                                                                       |
| Starting a sign-in or a sign-out answers with a server error             | `WORKOS_COOKIE_PASSWORD` is unset or shorter than 32 characters: nothing can be sealed or unsealed. Starting a sign-in fails this way for everyone; signing out and the portal page fail this way for a browser that carries a session cookie.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Set it for the environment and redeploy.                                                                                                                                                                                                                                            |
| WorkOS shows an error about the redirect URI                             | Expected, not verified against WorkOS: it does not have `<auth origin>/api/auth/callback` as a redirect URI, or `WORKSHOP_AUTH_ORIGIN` names a host other than the one registered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Register that exact address in the WorkOS dashboard for the environment of `WORKOS_CLIENT_ID`.                                                                                                                                                                                      |
| The sign-in host answers 404 when a sign-in starts                       | The log line `start refused: <reason>`. `no-request`: the sealed request is older than 60 seconds, or was sealed under another `WORKOS_COOKIE_PASSWORD` (a conference host on one deployment, the sign-in host on another). `host-refused`: see above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | For `host-refused`, check that the sign-in host is served by this deployment (DNS, the hosting provider) and read the host's row. For `no-request`, one sealing key per environment.                                                                                                |
| WorkOS sends the browser back and the sign-in host answers 404           | The log line `callback refused: <reason>`. `no-state`: more than 10 minutes passed, the state was sealed under another `WORKOS_COOKIE_PASSWORD`, or the request is not the return of a sign-in. `no-code`: WorkOS sent no code. `no-cookie`: the browser does not carry the sign-in host's cookie, or carries one from another start (a second start in the same browser replaced it). `host-refused`: see above. `conference-changed`: the host changed hands meanwhile. `the code exchange failed; nothing handed off`: the exchange with WorkOS failed.                                                                                                                                                                                                | For the exchange, read the description logged with the line; a request ID identifies the call at WorkOS. Which answers WorkOS gives was not verified. Check that `WORKOS_API_KEY` and `WORKOS_CLIENT_ID` belong to one WorkOS environment. Otherwise have the attendee start again. |
| The attendee lands on `/workshop` with "Sign-in did not complete"        | The log line `redeem refused: <reason>`. `no-hand-off`: more than 60 seconds passed, or the sign-in host and the conference's host do not share `WORKOS_COOKIE_PASSWORD` (a preview deployment handing off from, or to, production). `no-cookie`: the browser did not send the cookie the sign-in began with, or sent another one: a sign-in begun in a second tab replaced it, the return opened in another browser (an in-app browser, an installed app) than the one that began, or cookies are blocked. `other-host`: the token names another host. `host-refused`: the host may no longer sign in, or its record could not be read. `conference-changed`: the host changed hands meanwhile. `no-workshops`: the conference lost workshops meanwhile. | One value of `WORKOS_COOKIE_PASSWORD` per environment, and a preview rehearses with a sign-in host of its own. Otherwise have the attendee start again, in one tab of one browser.                                                                                                  |
| Sign-out ends on a WorkOS page, not on the conference site               | Expected, not verified against WorkOS: it does not have `<auth origin>/api/auth/workshop/signed-out` as a sign-out redirect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Register that exact address in the WorkOS dashboard. It is one address for every host.                                                                                                                                                                                              |
| Sign-out ends in a 404 on the sign-in host                               | The log line `sign-out refused: <reason>`. `no-request`: the sealed request is older than 60 seconds or sealed under another `WORKOS_COOKIE_PASSWORD`. `host-refused`: see above. Either way the attendee is already signed out on the conference site; the WorkOS login stays.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Nothing to fix on the conference site. The WorkOS login stays until it ends at WorkOS.                                                                                                                                                                                              |
| Sign-out ends on an empty page at `api.workos.com`                       | Seen on 2026-10-11 for a session ID WorkOS did not know: it answered an empty page and did not send the browser back. Not verified for a session that existed and has ended, which is what an attendee meets if the WorkOS session ends before the portal's 7 days. The attendee is signed out on the conference site.                                                                                                                                                                                                                                                                                                                                                                                                                                    | Have the attendee open the conference site again. Compare the session lifetime set at WorkOS with the portal's 7 days.                                                                                                                                                              |
| Sign-out ends on a plain "You are signed out" page                       | The log line `signed-out refused: <reason>`. `no-cookie`: more than 5 minutes passed at WorkOS, or the browser did not send the sign-in host's cookie. `host-refused`: the host stopped being verified meanwhile, or its record could not be read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Nothing to fix: the attendee is signed out. Have them open the conference site again.                                                                                                                                                                                               |
| Every attendee is signed out at once                                     | `WORKOS_COOKIE_PASSWORD` was changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Expected. Sessions are not migrated; attendees sign in again.                                                                                                                                                                                                                       |
| The attendee signs in and is told they have no access                    | Not a sign-in fault. Access is decided from the conference's tickets against the email and verified flag sealed into the session at sign-in: that email has to be the one the ticket is registered under, and WorkOS has to have reported it verified then (`src/lib/workshop/access.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Check the ticket's email and that the WorkOS login's email is verified. An email verified at WorkOS after sign-in counts only after the attendee signs out and in again.                                                                                                            |
| Signed in on one host, signed out on another                             | By design. The session belongs to one host and lasts 7 days. The WorkOS login itself is one account across every conference on the platform.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Nothing.                                                                                                                                                                                                                                                                            |

No status row reports `WORKOS_API_KEY`. What a missing or wrong key looks
like at WorkOS was not verified.

**With sign-in down**, an organizer can still put a ticket holder into a
workshop by hand: **Admin → Workshops**, **Add Participant** on the workshop's
card.

### Checking a deployment without a ticket

`curl -sI https://<conference host>/workshop/sign-in` must answer 307 with a
`Location` on the sign-in host, `<auth origin>/api/auth/workshop/start?request=…`.
Requesting that address in turn (`curl -sI '<Location>'`) must answer 307 to
`https://api.workos.com/user_management/authorize?…` whose `redirect_uri` is
`<auth origin>/api/auth/callback`. A `Location` of `/workshop` on the first
request means the conference's host may not sign in (see the table). What
WorkOS then shows is outside this check; one sign-in and sign-out by a person
is the only proof of the whole path.

### Operator: one-time setup per environment

1. In the WorkOS dashboard, create or pick the environment and note its client
   ID and API key (`WORKOS_CLIENT_ID`, `WORKOS_API_KEY`).
2. Choose the sign-in host. It is a hostname this deployment serves and that
   serves no conference; this platform's production deployment uses
   `https://auth.konf.app`. Set `WORKSHOP_AUTH_ORIGIN` to that bare `https`
   origin.
3. Register the two addresses at WorkOS, by hand, once:
   - redirect URI: `<auth origin>/api/auth/callback`;
   - sign-out redirect: `<auth origin>/api/auth/workshop/signed-out`.
4. Set `WORKOS_COOKIE_PASSWORD`: at least 32 characters, a value of this
   environment's own. It seals identity, so whoever holds it can issue a
   session. The production value must not be available to preview deployments.
   Changing it signs everyone out.
5. Confirm system status: `WORKSHOP_AUTH_ORIGIN` shows the origin,
   `WORKOS_CLIENT_ID` is set.
6. Run the check under "Checking a deployment without a ticket".

Setting `WORKSHOP_AUTH_ORIGIN` and registering the two addresses change
nothing for code that does not use them, so both can be done ahead of a
deploy. With the variable set, redirect URIs and sign-out redirects registered
at WorkOS for individual conference hosts are no longer used and can be
removed.

A preview deployment that rehearses sign-in needs hostnames of its own, the
staging keys and a sealing key of its own. The rehearsal host needs a proven
record in the dataset the preview reads, which is whatever its
`NEXT_PUBLIC_SANITY_DATASET` names; check that value in the hosting provider,
because a preview that reads the production dataset needs the record there,
and while it stands production would hand off to it. Revoke that record when
the rehearsal ends.

### Environment

| Variable                                                 | State                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`                     | set, both from the same WorkOS environment                                                   |
| `WORKOS_COOKIE_PASSWORD`                                 | set, at least 32 characters, different in every environment, production's never in a preview |
| `WORKSHOP_AUTH_ORIGIN`                                   | the sign-in host as a bare `https` origin; unset only on a single-domain installation        |
| `SANITY_API_TOKEN_READ`                                  | set: every sign-in decision reads the host's record live with it                             |
| `WORKOS_REDIRECT_URI`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | not needed; remove them and redeploy                                                         |
| `PLATFORM_DOMAIN_SUFFIX`                                 | the platform zone, so a `platform-owned` record counts as proven                             |
| `NEXT_PUBLIC_SANITY_DATASET`                             | the dataset the deployment reads records from and writes check results to                    |
| `CRON_SECRET`                                            | set, or the daily domain check answers 500 and stops                                         |

System status reports `WORKSHOP_AUTH_ORIGIN` and `WORKOS_CLIENT_ID`. It does not
report the API key or the sealing key; check those in the hosting provider.

The daily domain check (cron `/api/cron/domain-verification`, 05:00 UTC)
re-checks every claimed domain and alerts organizers; it does not touch WorkOS.
To run it now:
`curl -H "Authorization: Bearer $CRON_SECRET" https://<production host>/api/cron/domain-verification`.
Run it on the production host only: from any deployment it writes to the
dataset that deployment's `NEXT_PUBLIC_SANITY_DATASET` names and alerts
organizers. Check which dataset a preview names before running anything
there.

## Known gaps

From the design record (spec §9) and the code:

- Signing out on one host does not end a session the same attendee holds on
  another conference's host. It lasts until its 7 days are over.
- A login deleted at WorkOS, or an email or its verified flag changed there,
  takes effect on a conference's host only when its session ends: the access
  decision runs again on every page view and signup procedure, against the
  conference's tickets as they are now, but with the email and verified flag
  sealed into the session at sign-in. A change to the tickets is seen at once;
  a change at WorkOS is not.
- The hand-off token is not single use by any record: nothing remembers a
  redeemed token. A completed redeem clears the cookie that makes it the
  browser that began, and no other browser can redeem it.
- A verified host receives the hand-off for itself, whoever serves it. Whether
  the sign-in host asks the visitor to confirm before handing off to a host the
  platform did not allocate is an open decision (#1311).
- The per-host rows and the domain card say where the host's record stands.
  They do not reflect `WORKSHOP_AUTH_ORIGIN`; its own row does.
- Sign-out removes the session cookie from the browser that signs out. The
  sealed value itself is not revoked: it stays valid until its 7 days are
  over.
- Signing out after the portal's session has run out ends nothing at WorkOS:
  there is no session left to name the WorkOS login.
- No status row reports `WORKOS_API_KEY`.
- Not verified, because WorkOS was not exercised for this document: what
  WorkOS shows for an unregistered redirect URI or sign-out redirect; whether
  a second sign-in within the WorkOS login's lifetime is silent or shows the
  form again; whether WorkOS accepts a sign-out return address with a query
  string (nothing here depends on it: the host travels in a cookie on the
  sign-in host).
