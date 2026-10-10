# Workshop Sign-in Runbook

How the attendee workshop portal (`/workshop`) gets sign-in on a host, and what
to check when it does not. The design is in
[AUTH.md](AUTH.md#workos-authkit-workshops). The rules for hosts are in
[DOMAIN_VERIFICATION.md](DOMAIN_VERIFICATION.md#workos-redirect-uris-workshop-sign-in).

## What has to be true

Attendees can sign in on a host when all of these hold:

1. **The conference has workshops.** The organization's plan includes them and
   its ticketing can read tickets for this conference, or an operator has
   switched them on with a feature override.
2. **The platform controls the host.** It is either a host the platform
   allocated (for example `<name>.konf.run`), or a verified domain of a
   conference owned by the platform organization (`PLATFORM_ORG_ID`).
3. **WorkOS has the host's callback**, `https://<host>/api/auth/callback`, as a
   redirect URI. The application registers it; nobody adds it by hand.
4. **`WORKOS_COOKIE_DOMAIN` is not set** in the deployment.

A tenant's own domain does not carry the portal: every tenant shares one WorkOS
client, so a sign-in callback may only be on a host that the platform itself
serves and whose DNS the platform controls (#1306).

Local development is the one exception to 2 and 3. With
`NODE_ENV=development`, `localhost` needs no verification record and the
application registers nothing for it: it signs in on
`http://localhost:<port>/api/auth/callback`, which is added by hand to a WorkOS
staging environment. See [AUTH.md](AUTH.md#workos-workshops-only).

The conference's **first domain** decides the most. Ticket emails link to the
portal on it, and another host of the conference that cannot sign in sends
attendees there when the first domain can.

## Organizer: the portal on a new domain

Everything is on **Admin → Settings**, in the domain verification card. Each
domain has a "Workshop sign-in" line, shown when the conference has workshops.

### A host the platform provided

Nothing to do. The line reads **available** shortly after the host is
allocated or workshops are switched on, normally by the next daily check
(05:00 UTC). A plan changed from the control panel can take one check more.

### A domain of your own

This works for conferences of the platform organization only.

1. Add the domain to the conference's domains.
2. Publish the TXT record the card shows at your DNS provider. Its name is
   `_konf-challenge.<domain>` and its value starts with
   `konf-domain-verification=`.
3. Press **Check now**. The line goes from **domain not verified** to
   **registration pending** and then to **available**. Registration follows
   the check by itself, at the latest with the next daily check.
4. Make it the first domain if attendees should be sent there.

For every other organization the line reads **not offered on this host**, and
publishing the record does not change that. Use the host the platform provided.
While your own domain is the first one, ticket emails go out without the portal
link and "Resend sign-up instructions" stays disabled. Attendees can still sign
up at `https://<platform host>/workshop` if you send them that address
yourself.

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

Start at **Admin → Settings → System status** on the affected conference. There
is one row per host, named `Workshop sign-in: <host>`. The domain card shows the
same wording.

That page is open only to organizers of the conference's organization. A
platform operator who is not one of them cannot open it. Without that access,
read the host's record from a checkout of this repository, with a Sanity CLI
login that can read the dataset (a read; it writes nothing):

```
npx sanity documents query '*[_type == "domainVerification" && hostname == "<host>"][0]{hostname, "conference": conference._ref, status, method, graceUntil, lastSuccessAt, lastError, redirectUriStatus, redirectUriError}'
```

The row is built from this record, but the record is not the row. The row also
depends on who owns the conference, on the platform's current domain suffix and
on today's date, so do not derive the row from the fields. Read them for what
they say, and ask an organizer of that organization for the row itself. The
fields are defined in `sanity/schemaTypes/domainVerification.ts`:

- `conference` is the conference currently claiming the hostname. A record
  held by another conference says nothing about this one.
- `status` is the state the verification policy keeps for the claim: `pending`
  (never proven), `verified`, `failing` (a check found no proof) or
  `revoked` (the claim was released). It is not the result of the latest
  check: a verified domain can stay `verified` through failed lookups.
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
- `redirectUriStatus` is where the host's callback stands in WorkOS as the
  application recorded it: `registered` (created by the application, which
  holds its id), `external` (present in WorkOS, and the application holds no
  id for it), or empty (the application holds none). `redirectUriError` is why the last attempt to
  register or remove it failed; the next success clears it.

The error `Query returned no results` means the host has no record. A CLI
that is not signed in is reported to answer the same way instead of naming the
missing login (see `AGENTS.md`), so check the login before concluding that.
The record does not show `WORKOS_COOKIE_DOMAIN` or whether the conference has
workshops; check those in the deployment and on the organization.

| The row says                   | It means                                                                                                                           | What to do                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (no row)                       | The conference does not have workshops, or has no host to report: no domain, or only wildcard and development entries.             | Check the organization's plan and feature overrides, that its ticketing is connected for this conference, and the conference's domains.                                    |
| **unknown** (one row, no host) | The standing could not be read. The detail is the error.                                                                           | Reload. If it stays, look at the Sanity read errors in the logs.                                                                                                           |
| **domain not verified**        | No verification record, or its proof has not resolved, has gone stale or is only grandfathered.                                    | `dig +short TXT _konf-challenge.<host>` must return the value on the domain card. Then press **Check now**.                                                                |
| **not offered on this host**   | The host is not platform-allocated and its conference is not owned by `PLATFORM_ORG_ID`.                                           | Nothing to fix for a tenant's own domain: point the tenant at its platform host. For a conference of the platform organization, check `PLATFORM_ORG_ID` in the deployment. |
| **registration pending**       | The host is verified and the reconcile has not registered it yet.                                                                  | See "The reconcile did not run" below.                                                                                                                                     |
| **registration failed**        | The last attempt to register the callback failed. The detail is the recorded error: WorkOS's answer, or a failure to reach WorkOS. | It is retried with every daily check. Check that `WORKOS_API_KEY` belongs to the environment of `WORKOS_CLIENT_ID`, and the Redirects page in the WorkOS dashboard.        |
| **switched off on every host** | `WORKOS_COOKIE_DOMAIN` is set in the deployment.                                                                                   | Unset it and redeploy. No host can sign in while it is set.                                                                                                                |
| **available**                  | The application will start a sign-in on this host.                                                                                 | See "The row says available" below.                                                                                                                                        |

### The reconcile did not run

The reconcile registers and removes redirect URIs. It runs only on the
production deployment (`VERCEL_ENV=production`) and only with `WORKOS_API_KEY`
set. It runs after a domain is claimed, released or allocated, after a
**Check now** that changed the domain's standing, after a plan or feature
override change, and at the end of the daily check (cron
`/api/cron/domain-verification`, 05:00 UTC).

- Look for that cron in the deployment's logs, and for lines starting with
  `[workshop]`.
- To run the daily check now:
  `curl -H "Authorization: Bearer $CRON_SECRET" https://<production host>/api/cron/domain-verification`.
  It is the same job as the scheduled one: it re-checks every claimed domain
  and sends organizers the same alerts.
- Previews and local development never run the reconcile. They read the
  production dataset, so they show the registrations production made and add
  none.
- Run the daily check on the production host only. The check itself is not
  limited to production, and from any deployment it writes to the production
  dataset and alerts organizers.

### The row says available

| Symptom                                                    | Check                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WorkOS shows an error about the redirect URI               | The URI was removed in the WorkOS dashboard. The reconcile lists WorkOS on every run and creates a wanted URI that is missing, so the next run puts it back.                                                             |
| The sign-in or the callback answers with a server error    | `WORKOS_CLIENT_ID`, `WORKOS_API_KEY` and `WORKOS_COOKIE_PASSWORD` (at least 32 characters) must be set for the production environment.                                                                                   |
| Sign-out ends on a WorkOS page, not on the conference site | Add `https://<host>/` as a Sign-out redirect in the WorkOS dashboard. This is done by hand for each host; the reconcile only manages redirect URIs.                                                                      |
| The attendee signs in and is told they have no access      | Not a sign-in fault. Access is decided from the conference's tickets: the email the ticket is registered under has to be the one signed in with, and WorkOS has to report it as verified (`src/lib/workshop/access.ts`). |
| Signed in on one host, signed out on another               | By design. The session cookie belongs to one host. The WorkOS login itself is one account across every conference on the platform.                                                                                       |

### Environment

| Variable                                                 | State                                                                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`                     | set, both from the same WorkOS environment                                                                                             |
| `WORKOS_COOKIE_PASSWORD`                                 | set, at least 32 characters                                                                                                            |
| `WORKOS_COOKIE_DOMAIN`                                   | **not set**                                                                                                                            |
| `WORKOS_REDIRECT_URI`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | not needed; remove them and redeploy (#1299). See [AUTH.md](AUTH.md#workos-workshops-only) for what the SDK still does with the second |
| `PLATFORM_ORG_ID`                                        | the platform organization's Sanity `_id`                                                                                               |
| `CRON_SECRET`                                            | set, or the daily check answers 500 and stops                                                                                          |

System status reports `WORKOS_CLIENT_ID` and `WORKOS_COOKIE_DOMAIN`. It does not
report the API key or the cookie password; check those in the hosting provider.

To see what WorkOS's redirect-URI API answers without touching production data,
run `pnpm tsx scripts/probe-workos-redirect-uris.ts` with a staging key.

## Known gaps

- A host whose record is no longer verified, or that its conference no longer
  claims, is refused sign-in from that moment, before any reconcile. Its
  callback stays registered in WorkOS until one runs. A host that stays
  verified and claimed but stops being platform-controlled (its conference
  changes owner, for example) keeps its sign-in until a reconcile clears its
  registration, at the latest with the daily check (#1306). Only a URI the
  application created is deleted from WorkOS; one it merely found there stays.
- A tenant whose first domain is its own has no emailed portal link (#1306).
- Sign-out redirects are registered by hand.
- Nothing expires by itself. A redirect URI stays until a reconcile runs and
  removes it.
- The row and the record say what the application recorded, not what WorkOS
  holds now. A URI deleted by hand in WorkOS reads **available** until the
  next reconcile puts it back.
