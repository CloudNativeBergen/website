# Customer Onboarding Checklist

Every manual step required to take a new customer from nothing to a live
conference — issue an invite, provision a tenant, hand over an address, get the
organizer into `/admin`, and (optionally) attach their own domain.

This is the artifact RunKonf/platform#42 phase 2 asks for, and the thing
phase 3's dress rehearsal tests. Its done-when is **"the rehearsal completes
with zero off-checklist actions"**, so an omission here is the failure — not a
wrong word.

> **Nobody has ever walked this path.** Production holds **zero**
> `provisioningRequest` documents (verified 2026-08-14 by direct query), so
> `POST /api/provisioning/organizations` has never run end to end. The demo
> tenant KontainerKonf was seeded straight into Sanity by
> `scripts/seed-kontainerkonf-demo.ts` (RunKonf/platform#55) — its organization
> id is the literal `kkdemo.org`, which no real provisioning would produce.
> Treat every step below as **derived from code, not from experience**, and
> expect the first run to find something.

## How to read this

Each step says what to do, **how to verify it worked**, and what to do when it
did not. A step with no verification is a step that silently half-completes.

| Tag              | Meaning                                                                            |
| ---------------- | ---------------------------------------------------------------------------------- |
| **[AUTO]**       | The provisioning endpoint or a cron does it. Nobody types anything.                |
| **[OPERATOR]**   | A human with platform accounts (Vercel/Resend/registrar/GitHub) must act.          |
| **[CUSTOMER]**   | The customer does it themselves, in kontroll or `/admin`.                          |
| **[IMPOSSIBLE]** | No code exists for it today. Named, not invented around.                           |
| **[UNVERIFIED]** | Stated from code, not confirmed against production. What would settle it is named. |

Two applications are involved and they are **separately deployed, separately
authenticated, and have separate sessions**:

- **kontroll** — `my.konf.app` (`RunKonf/kontroll`). Invites, redemption, org
  settings. OAuth only; host-only cookie.
- **the website** — the conference site itself (`RunKonf/website`). Provisioning
  transaction, `/admin`, domain verification, all outbound mail.

Signing in to one is **not** signing in to the other. That is deliberate
(kontroll `README.md` §4) and the customer will be surprised by it, so say it
out loud during handover.

---

## Phase 0 — Platform prerequisites (once, not per customer)

Do these before the first customer. Every one of them fails **closed and
quietly** except where noted.

### 0.1 `PROVISIONING_API_TOKEN` on the website project — **[OPERATOR]**

**Do:** set a shared secret of **at least 32 characters** on the website's
Vercel project, and the _identical_ value on kontroll's project under the
_same_ variable name (kontroll deliberately mirrors the name — see its
`.env.example`; a mismatch of names was kontroll#1).

**Verify:** unauthenticated `POST` returns `401`; correct token returns
something other than `401`. The `401` is byte-identical for "unset", "absent
header" and "wrong token" by design (`src/app/api/provisioning/organizations/route.ts`),
so **a 401 does not tell you which**. The only positive proof is a real
authenticated call.

**If it did not work:** kontroll's setup form reports _"Setup is not available
right now"_ and logs `[setup] provisioning unavailable`. Nothing is created.

**Note:** this token also authorizes `POST /api/provisioning/cache/invalidate`,
by design (`docs/PROVISIONING_API.md`). One secret, one rotation.

### 0.2 `PLATFORM_DOMAIN_SUFFIX=konf.run` on the website project — **[OPERATOR]** **[UNVERIFIED]**

**This is the step most likely to break the first real run.** Without it
`derivePlatformHosts` refuses, `provisionOrganization` returns
`no_host_available`, and the endpoint answers
`500 { code: "platform_domain_unconfigured" }`. Nothing is written — the tenant
is refused rather than created at no address.

**Current production state is unverified.** Two facts that do _not_ settle it:
`kontainerkonf.konf.run` serves HTTP 200 (that is DNS + Vercel, not this
variable), and production holds **zero** `domainVerification` records with
`method: "platform-owned"` (that is explained by the seed script never calling
`syncDomainVerifications` at all — it writes `domains[]` directly).

**What would settle it:** one read of the website project's env in the Vercel
dashboard. There is no in-app surface for it — `PLATFORM_DOMAIN_SUFFIX` appears
in `src/lib/system-status/checks.ts` **nowhere**, so `/admin/settings` cannot
tell you. Its absence is only observable by attempting a provision and reading
the 500. That is a real gap; a status-page row for it belongs on the same
backlog as the effective-sender check.

**Verify (destructive, and the only way today):** provision a scratch tenant and
confirm the response's `challenges[]` contains `<slug>.konf.run` and
`<slug>-<year>.konf.run`.

**If it did not work:** you get the 500 above. Retrying will not help. Set the
variable and **redeploy** — Vercel does not apply env changes to a running
deployment.

### 0.3 Platform mail identity — **[OPERATOR]**

**Do:** verify `konf.app` in Resend, then set `EMAIL_FALLBACK_FROM` (e.g.
`Konf <noreply@konf.app>`) and `EMAIL_SENDING_DOMAINS` (comma-separated list of
every domain verified on the platform Resend account) on the website project.

**Verify — DNS half, already true as of 2026-08-14:**

```
dig +short TXT resend._domainkey.konf.app   # → a p=MIG... key. PRESENT.
dig +short MX  send.konf.app                # → feedback-smtp.eu-west-1.amazonses.com. PRESENT.
dig +short TXT send.konf.app                # → "v=spf1 include:amazonses.com ~all". PRESENT.
```

This **contradicts RunKonf/platform#57 M-A and #34 item 1**, which were written
when neither record existed. The DNS half of item 1 is done. What is _not_
verified from here: whether Resend's dashboard shows the domain as verified,
and whether `EMAIL_FALLBACK_FROM` / `EMAIL_SENDING_DOMAINS` are actually set —
both need a dashboard read.

**Verify — app half:** `/admin/settings#system-status` renders the
`EMAIL_FALLBACK_FROM` row and the effective-sender check
(`src/lib/system-status/checks.ts`). Read it on the tenant, not just on the
platform org.

**If it did not work:** an unverified tenant domain with no fallback means
`instrumentResendClient` rewrites nothing and the send is **refused by Resend
and logged**, not delivered. The sign-in flow is deliberately opaque
(`src/lib/auth/email-link/request.ts`), so the customer sees "check your email"
and nothing arrives. This is the single most silent failure on the whole path.

**Also decide:** the Resend plan. Free tier is 3,000/month, 100/day — a ~300-send
CFP decision round fails mid-batch (platform#57 M-A, #44).

### 0.4 kontroll configuration — **[OPERATOR]**

**Do:** on kontroll's Vercel project set `KONF_WEBSITE_API_URL` (https, no
trailing slash), `PROVISIONING_API_TOKEN`, its **own** `AUTH_SECRET` (never the
website's), `KONF_PLATFORM_OPERATORS`, and the Sanity variables — which are
`NEXT_PUBLIC_SANITY_PROJECT_ID` / `NEXT_PUBLIC_SANITY_DATASET`, **not**
`SANITY_STUDIO_*`.

**Verify:** sign in at `my.konf.app` and open `/operator`. If you are not an
operator the page says so; `KONF_PLATFORM_OPERATORS` fails closed (unset =
nobody). The page also shows you your own identity key, which is what you put in
that variable to stop bootstrapping by email.

**If it did not work:** `resolveProvisioningConfig`
(`src/lib/lifecycle/provisioning.ts`) names the exact missing variable in the
server log; the customer only sees "not available right now".

### 0.5 Sign-in providers — **[OPERATOR]** **[UNVERIFIED]**

kontroll offers a provider **only if both its id and secret are set**. GitHub and
LinkedIn are registered; **Google is not** (#34 item 8), and kontroll has **no
magic link at all, deliberately** (its README §4). So a non-developer customer
must have a GitHub or LinkedIn account.

The website is different: it _does_ have email magic-link sign-in
(`src/lib/auth/email-link/`, live and wired in `src/lib/auth.ts`). Do not
conflate the two.

**Verify:** load `https://my.konf.app/signin` and count the buttons. (A curl of
that page did not expose the provider names to a grep, so this is unverified
from here.)

### 0.6 Open question that changes this checklist — **[UNVERIFIED]**

**Is `AUTH_REDIRECT_PROXY_URL` set on the website project?** The record
contradicts itself (platform#28 vs the #38 correction of 2026-08-04). The code
reads it and, when present, sets `redirectProxyUrl` + `trustHost`
(`src/lib/auth.ts`, asserted in `src/lib/auth.test.ts`).

**It decides whether step 4.5 — "register an OAuth callback per tenant per
provider" — exists at all.** One env read settles it. Until then, treat 4.5 as
required.

---

## Phase 1 — Issue the invite

### 1.1 Issue it in kontroll — **[OPERATOR]**

**Do:** at `my.konf.app/operator`, choose mode **new organization** and fill in
the invitee's email, the organization name and slug, and optionally a billing
email. Role is forced to `owner` — there is nobody above the first member.

What this writes: a `portalInvite` carrying a `pendingOrganization` description
and a `provisioningKey` (the idempotency key, minted **here**, once, and stored).
It creates **no** organization. TTL is **14 days**.

**Verify:** the success panel shows the invite code. Only
`sha256(code + AUTH_SECRET)` is stored, so **this is the last time the code
exists anywhere**. Copy it now.

**If it did not work:** a taken slug is refused inline (kontroll runs its own
global `isOrgSlugTaken`). If you lose the code, revoke the invite and issue a
new one — there is no recovery.

### 1.2 Deliver the invite to the customer — **[IMPOSSIBLE] as an automated step; [OPERATOR] in practice**

**There is no mailer in kontroll.** No send path, no template, no Resend client.
The code is rendered on screen and nothing else happens. Invite delivery is
platform#54 Phase 1 and depends on the platform mail identity in step 0.3.

**Do:** send it yourself, out of band, from an address the customer will trust.
Include: the code, `https://my.konf.app`, which sign-in providers exist (0.5),
and that the invited **address must match the account they sign in with**.

**Verify:** none available. There is no delivery receipt, no "invite sent"
state, and no way to see whether they opened it. `/operator`'s invite list shows
redemption, which is the first observable event — and it is downstream of
delivery, not of it.

**If it did not work:** you will find out only by the invite never being
redeemed. Follow up manually.

---

## Phase 2 — The customer redeems

### 2.1 Sign in at `my.konf.app` — **[CUSTOMER]**

**Verify:** they land either on a "request access" state (signed in, no
membership) or, once redeemed, on the org list.

**If it did not work:** OAuth failures come back to kontroll's own `/signin`
with a sentence, not to `@auth/core`'s bare card.

### 2.2 Enter the invite code — **[CUSTOMER]**

**Do:** the code form. Reachable from the empty state **and** from `/invite`.

> RunKonf/kontroll#56 — "an invite to a second organization can never be
> redeemed", because the code form only existed in the empty state — is
> **CLOSED**, and `src/app/invite/page.tsx` exists. The task brief lists it as
> an open gap; it is not. Confirm on the day by opening `/invite` while already
> a member of something.

**Verify:** they see "One step left" and a link to `/setup/<inviteId>`.

**If it did not work — the identity check is the likely cause.** An invite is
addressed to an email; if the OAuth account asserts a _different_ address,
redemption is **refused** and the invite is **not burned**
(`src/lib/portal/redeem.ts`). The message deliberately does not disclose the
invited address. Remedy: have them sign in with the matching account, or revoke
and re-issue to the address they actually use.

---

## Phase 3 — Provision the tenant

### 3.1 The customer completes `/setup/<inviteId>` — **[CUSTOMER]**

**Do:** they fill in organization (name, slug, contact email, optional billing
email), conference (title, city, country, optional start/end dates — **both or
neither**), and the organizer's name and email.

**Read the organizer email field carefully with them.** It becomes a `speaker`
document on the website and is the account that will hold `/admin`. It does
**not** have to be the kontroll account, and if it is wrong the fix is a support
action, not a form edit.

### 3.2 What the endpoint does — **[AUTO]**

One `POST /api/provisioning/organizations` from kontroll, carrying the invite's
stored `provisioningKey` as `Idempotency-Key`. In **one atomic Sanity
transaction** (`src/lib/onboarding/provision.ts`):

- an `organization`;
- its first `conference` — `visibility: 'unlisted'`, `registrationEnabled:
false`, contact/CFP/sponsor emails defaulted to the org contact address,
  `formats` seeded with lightning-10 / presentation-25 / presentation-45, and
  **`topics` deliberately empty**;
- the organizer's `speaker` document, **or** a patch adding org membership to an
  existing speaker matched by verified email;
- a `provisioningRequest` receipt keyed `sha256(key + AUTH_SECRET)`;
- `domains[]` claiming `<slug>.konf.run` and `<slug>-<year>.konf.run` (they
  collapse to one host when no dates were given).

Then, **outside** the transaction and best-effort, `mintChallenges` writes a
`domainVerification` record per host with `method: "platform-owned"`.

**Verify:** the setup success panel names the conference and links its address.
Then confirm in the lake:

```
npx sanity documents query '{"n": count(*[_type=="provisioningRequest"])}'
```

It should be **1** after the first ever real run (it is 0 today). Also check the
allocation records exist:

```
npx sanity documents query '*[_type=="domainVerification" && method=="platform-owned"]{hostname, status}'
```

**If it did not work,** by response code:

| Code                               | Meaning                                            | Remedy                                                                                                             |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `409 slug_taken`                   | Org slug globally taken                            | Pick another slug. **See the warning below.**                                                                      |
| `409 platform_host_taken`          | Slug free, its minted host is not                  | Different slug. Never stolen, never auto-suffixed.                                                                 |
| `409 reserved_slug`                | Slug is a platform label (`www`, `api`, `auth`, …) | Different slug.                                                                                                    |
| `409 domain_claimed`               | A named domain overlaps another tenant's claim     | Remove it; investigate the claim.                                                                                  |
| `409 ambiguous_organizer`          | The organizer email matches **several** speakers   | **Merge the duplicate accounts first.** Operator action in the website; the endpoint refuses rather than guessing. |
| `400 schema_validation_failed`     | Bad payload                                        | The message names the field.                                                                                       |
| `429`                              | Rate limited (5/min, 30/hour, 100/day globally)    | Wait; nothing was created.                                                                                         |
| `500 platform_domain_unconfigured` | Step 0.2                                           | Not retryable. Set the variable, redeploy.                                                                         |
| `500` (other)                      | Transaction failed                                 | Nothing was written. Resubmit — same key replays.                                                                  |

> **Do not let a stranded customer change the slug and retry after ~30 days.**
> The `provisioningRequest` receipt is purged after
> `PROVISIONING_RECEIPT_RETENTION_DAYS = 30`, while the invite outlives it. Past
> that window a **changed** slug hits no receipt and no slug collision, and
> commits a **second full tenant**, orphaning the first (RunKonf/kontroll#15,
> open). Same slug is safe — it hits `slug_taken`. If a setup has been stranded
> for weeks, handle it yourself rather than telling them to pick a new slug.

### 3.3 kontroll binds the membership — **[AUTO]**

One write after the transaction: the invite's `organization` reference. Until it
lands, the person holds a redeemed invite and no organization.

**Verify:** the org appears in their kontroll org list.

**If it did not work:** the setup form reports status `incomplete` — **not
`error`**. The tenant exists; only kontroll's record of it is missing. The
remedy is to resubmit the same form (safe: the same stored key replays and
returns the original ids). Do not tell them the organization was not created; it
was.

---

## Phase 4 — The address

### 4.1 The platform host — **[AUTO]**

`<slug>.konf.run` (short, moves to the org's latest edition) and
`<slug>-<year>.konf.run` (permanent). Both are a single label under the suffix,
which is what the existing wildcard certificate covers.

**Verify:** open both. `konf.run` is delegated to Vercel DNS
(`ns1/ns2.vercel-dns.com`), and the wildcard is already attached — verified
2026-08-14: `https://kontainerkonf.konf.run` and
`https://kontainerkonf-2026.konf.run` both return **200** and serve the
KontainerKonf site.

**If it did not work:** a 404 or a Vercel "deployment not found" page means the
wildcard assignment is missing on the project, not that provisioning failed.

### 4.2 Custom domain — the customer claims it — **[CUSTOMER]**

**Do:** in the website's `/admin/settings`, add the hostname to the conference's
domains (`conference.updateDomains`, an `adminProcedure` — organizer-only, and
it refuses an unallocated in-zone `*.konf.run` hostname outright).

**Verify:** `/admin/settings#domain-verification` lists the host with the exact
TXT record to publish and its status.

### 4.3 Custom domain — publish the TXT record — **[CUSTOMER]**

```
_konf-challenge.<hostname>   TXT   "konf-domain-verification=<token>"
```

A `*.example.com` claim is proven on the base zone (`example.com`).

**Verify:** the card's re-check action, or `dig +short TXT
_konf-challenge.<hostname>`. The daily sweep runs at **05:00 UTC**
(`/api/cron/domain-verification`), so do not wait for it during a rehearsal —
press re-check.

**If it did not work:** status `failing` means DNS answered and the proof was
absent (hard failure); `pending` means it has never verified. A timeout is a
_soft_ failure and never delists on its own.

### 4.4 Custom domain — attach it in Vercel — **[OPERATOR]. There is no code for this.**

**Do:** add the hostname to the website's Vercel project in the dashboard and
complete whatever DNS record Vercel asks the customer for (A/CNAME).

**This is manual by decision (platform#34).** There is no automation anywhere:
`grep -rn 'api.vercel.com\|VERCEL_TOKEN\|vercel/domains' src scripts docs`
returns **nothing**. Verifying the TXT challenge proves _ownership_; it does not
route traffic. Both halves are required and they are independent.

**Verify:** `curl -sI https://<hostname>/` returns 200 from our deployment, and
the certificate covers the host.

**If it did not work:** the customer sees Vercel's own error page, not ours,
which is confusing enough to be worth warning them about before you start.

### 4.5 OAuth callbacks per tenant per provider — **[OPERATOR], conditional** — **[UNVERIFIED]**

**Only if `AUTH_REDIRECT_PROXY_URL` is unset** (step 0.6). If it is unset, each
custom domain needs its callback URL registered in the GitHub and LinkedIn OAuth
applications before sign-in works on that domain.

**Verify:** actually sign in on the custom domain. There is no other check.

**If it did not work — this fails silently on our side.** The provider refuses
at its own end and **nothing appears in our logs**. Budget for it: a customer
reporting "sign-in is broken" with a clean log is this.

**Also establish before ~10 custom-domain tenants:** GitHub's and LinkedIn's
per-application redirect-URL ceilings. The ceiling, not the Vercel attach, is
what eventually forces the central auth origin (platform#42).

---

## Phase 5 — The organizer reaches `/admin`

### 5.1 First sign-in on the tenant site — **[CUSTOMER]**

**Do:** sign in at `https://<slug>.konf.run` — a **separate** sign-in from
kontroll. GitHub, LinkedIn, or the email magic link.

The account links to the provisioned `speaker` document by **verified-email
intersection** (`getOrCreateSpeaker`). So the address they authenticate with
must be one the provisioning payload named, or one already on that speaker's
`knownEmails`.

**Verify:** `/admin` loads. Access comes from `organizerOrgIds`, derived from
`conference.organizers[]`.

**If it did not work:** the usual cause is a different address at the provider.
Signing in with the right address and re-checking is the first thing to try;
duplicate speaker accounts are the second (and are the same defect class as
`ambiguous_organizer` in 3.2).

### 5.2 Per-tenant secrets, if the customer brings their own — **[OPERATOR], and it is a code change**

Two mechanisms (`docs/TENANT_SECRETS.md`):

- `TENANT_<SLUG>_<FAMILY>_<FIELD>` discrete Vercel variables — e.g.
  `TENANT_ACME_EMAIL_API_KEY`, `TENANT_ACME_CHECKIN_API_KEY`. Preferred; wins
  over the blob.
- `TENANT_SECRETS_JSON`, a single map keyed by organization `_id`. Still
  supported.

**The `<SLUG>` is not the org slug.** It is an opaque uppercase-alphanumeric
label that must be added to `TENANT_ENV_SLUGS` in
`src/lib/secrets/env-per-org.ts` — **a deploy-time constant in source code**,
deliberately, so that an organizer renaming their org cannot silently rebind
credentials. It currently holds exactly one entry:
`'organization-cloud-native-days': 'CNDN'`.

So onboarding a tenant onto its own credentials is: **a PR, a review, a merge
and a deploy** — plus setting the variables and redeploying. Not a dashboard
action. Plan the lead time.

**Verify:** the map is validated at module load; a bad or duplicate slug throws
at build/boot. Partial configuration is ignored and warned about **once**
(`[secrets] TENANT_<SLUG>_..._* is partially configured`) — a half-configured
tenant resolves to unconfigured and silently keeps using the platform account,
which is exactly the state to watch for.

---

## Phase 6 — Get the conference live

The activation checklist at `/admin/settings` drives this
(`src/lib/settings/activation.ts`). Rows, in order:

**Call for papers:** `cfp-window`, `topics`, `formats`.
**Launch:** `basics`, `dates`, `venue`, `branding-logo`, `emails`,
`registration`, `ticketing`, `email-delivery`, `slack` (optional),
`custom-domain` (optional), and finally `visibility` — "Go live".

Two things a freshly provisioned tenant needs that are easy to miss:

- **Topics are empty on purpose.** `canAcceptProposals` is formats **AND**
  topics, so the CFP accepts nothing until the organizer picks topics. Formats
  are seeded; topics are not, because any seed would impose one conference's
  subject matter on every tenant.
- **`visibility` is `unlisted` and `registrationEnabled` is `false`.** The site
  is not publicly discoverable until the organizer flips it.

**Verify:** the checklist counts required rows done; the terminal "Go live" row
is last by construction.

---

## Smoke test — run this at the end of every onboarding

1. `https://<slug>.konf.run` loads the conference site. **[observable]**
2. `https://<slug>-<year>.konf.run` loads it too. **[observable]**
3. The organizer signs in on the tenant domain and reaches `/admin`. **[observable]**
4. `/admin/settings#domain-verification` shows every claimed host with an
   expected status — `Provided by the platform` for the minted hosts. **[observable]**
5. A test mail (e.g. a magic-link sign-in) **arrives**, and its `From:` is the
   tenant's identity or `EMAIL_FALLBACK_FROM` — never another conference's
   domain. **[observable only by receiving it]**
6. If a custom domain was attached: sign in **on that domain**. **[observable]**
7. `count(*[_type=="provisioningRequest"])` increased by exactly 1. **[observable]**

---

## Where a rehearsal will get stuck — outcomes nobody can see

Collected deliberately, because these are the steps that will produce "I think
it worked?" rather than a yes or a no.

| Step                         | Why it is not observable                                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.2 invite delivery          | No mailer, no send record, no delivery state. First signal is redemption.                                                                                                                      |
| 0.1 token correctness        | Every auth failure is a byte-identical 401. Only a successful call proves it.                                                                                                                  |
| 0.2 `PLATFORM_DOMAIN_SUFFIX` | Surfaced nowhere in the app. Only a provisioning attempt (or a Vercel env read) reveals it.                                                                                                    |
| 0.3 mail sending             | A refused send is logged server-side; the sign-in flow is opaque by design, so the customer sees success either way.                                                                           |
| 4.5 OAuth callback           | Fails at the provider. Nothing in our logs at all.                                                                                                                                             |
| 5.2 partial tenant secrets   | Warned once in the server log, then silently falls back to the platform account.                                                                                                               |
| 3.2 `mintChallenges`         | Best-effort and must never throw, so a challenge that failed to mint looks like a clean provision. The daily sweep does **not** re-mint missing records — only `syncDomainVerifications` does. |

---

## Known defects on this path

- **RunKonf/platform#55** — the endpoint has never run end to end. Open.
- **RunKonf/kontroll#15** — a setup stranded past the 30-day receipt retention
  can mint a **second tenant** if the customer changes the slug, and the product
  actively advises changing the slug. Open. See the warning in 3.2.
- **Invite delivery has no mailer** — platform#54 Phase 1, and it depends on
  step 0.3. There is no partial version of this; it is out-of-band today.
- **RunKonf/kontroll#12** — the conference list shows dev hosts
  (`*.vercel.app`, `localhost:3000`, an ngrok host) and never links the real
  address. Still open, though `src/lib/conference/public-domains.ts` and a
  `conference-links` test exist in that repo, so it may be fixed and the issue
  stale. **[UNVERIFIED]** — check what the customer actually sees.
- **Domain-routing enforcement would take the demo tenant dark.**
  `DOMAIN_VERIFICATION_ENFORCE_ROUTING` requires a `domainVerification` record
  per routed host. KontainerKonf's two `konf.run` hosts have **no record at
  all** — the seed script writes `domains[]` and never calls
  `syncDomainVerifications` — yet they serve 200 today, which is also the
  evidence that enforcement is currently **off** in production. Turning it on
  without first allocating those two records takes the customer-facing demo
  offline. Related: the grandfathered entries expire **2026-09-03**
  (`2024.cloudnativebergen.dev`, `2025.cloudnativebergen.dev`,
  `localhost:3001`), and `2026.cloudnativedays.no` is `dns-txt` / **`failing`**
  — verified by query 2026-08-14.

## Production facts this document was written against

Verified 2026-08-14 by direct query and DNS lookup. Re-check them rather than
trusting them; they are a snapshot, not a contract.

| Fact                            | Value                                                             |
| ------------------------------- | ----------------------------------------------------------------- |
| `provisioningRequest` documents | **0**                                                             |
| `domainVerification` documents  | 7 — 3 grandfathered, 4 dns-txt, **0 platform-owned**              |
| `organization` documents        | 2 (`organization-cloud-native-days`, `kkdemo.org`)                |
| `conference` documents          | 4                                                                 |
| `portalInvite` documents        | 5                                                                 |
| `konf.run` nameservers          | `ns1.vercel-dns.com`, `ns2.vercel-dns.com`                        |
| `kontainerkonf.konf.run`        | HTTP 200, serves KontainerKonf 2026                               |
| `resend._domainkey.konf.app`    | present                                                           |
| `send.konf.app` MX / SPF        | `feedback-smtp.eu-west-1.amazonses.com` / `include:amazonses.com` |
| `_dmarc.konf.app`               | `v=DMARC1; p=none;`                                               |

## Related reading

`docs/PROVISIONING_API.md` · `docs/DOMAIN_VERIFICATION.md` ·
`docs/TENANT_SECRETS.md` · `RunKonf/kontroll` README (the write partition, the
authorization model, and the two invite modes).
