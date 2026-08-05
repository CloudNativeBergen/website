# Domain Ownership Verification

DNS-based proof that a tenant actually controls the hostnames it claims in
`conference.domains[]` — and continuous re-proof afterwards (#683).

## Why

`domains[]` is globally unique and routing-overlap checked (#666/#679/#681), but
uniqueness is not ownership. Two consequences:

1. **Squatting.** Any organizer could claim any unclaimed hostname and block its
   rightful owner from ever onboarding it.
2. **Auth-redirect grant.** Under the central-auth-origin design (#688),
   `domains[]` is exactly the allowlist of permitted post-login redirect
   destinations. An unproven claim is therefore an authorization-redirect grant —
   the canonical way an authorization code leaks.

**First-time verification is not enough.** Conference domains churn hard: events
end, organizers stop renewing, and a lapsed one-off event domain gets
re-registered by someone else while still sitting in `domains[]`. Secureworks /
Sophos documented full account impersonation — access _and_ refresh tokens —
obtained through exactly that stale-destination path, and the critical property
is that **the victim sees a successful login and no error at all**. Nothing but a
machine re-asking the question on a schedule will ever notice.

## The challenge

A per-hostname random token published as a DNS TXT record:

```
_konf-challenge.<hostname>   TXT   "konf-domain-verification=<token>"
```

A `*.example.com` wildcard claim is proven on its **base zone** (`example.com`).

### Why TXT, not CNAME or an ACME/HTTP-style flow

- **TXT under a `_`-prefixed label** is what every comparable product uses
  (Google Workspace, AWS ACM, Vercel, Let's Encrypt DNS-01), and it is
  _idempotently re-checkable_: the record stays published, so we can re-resolve
  it forever without the tenant lifting a finger. Continuous re-verification is
  the whole point, so a one-shot proof would not do.
- **CNAME** is also re-checkable but cannot coexist with other records at the
  same name (RFC 1034 §3.6.2), and buys nothing a TXT does not.
- **HTTP-01 / serve-a-file** is circular here. It proves control of whatever
  server the hostname points at — which, in the dangling-DNS case we are
  defending against, is the attacker. A record in the tenant's own zone proves
  control of the **zone**, which is the thing that actually lapses.

## Platform-allocated hosts

Tenants are hosted by default on a subdomain the platform **mints** for them
(`<slug>.konf.run`). That zone's nameservers are delegated to our own edge and a
wildcard certificate covers every label under it — the tenant has no access to it
at all. Asking them for a `_konf-challenge` TXT record there is asking them to
write into a zone only we can write to, so under routing enforcement every
platform-hosted tenant would simply go dark.

Such a host is therefore verified **by construction**, recorded as
`method: "platform-owned"`. Unlike `grandfathered` this is **permanent**: no
`graceUntil`, no staleness expiry, nothing for the tenant to complete.

### Being in our zone is a precondition, not an entitlement

The tempting shortcut — "it is under our suffix, therefore it is verified" — is a
**cross-tenant hijack**. "This host is in our zone" says nothing about _which_
tenant is entitled to it. An organizer can type any hostname into
/admin/settings, so a read-time suffix inference lets them claim
`some-other-tenant.konf.run`, or a label earmarked for a customer being onboarded
next week, and be handed routing plus (once #688 ships) an OAuth redirect
destination for it. Global uniqueness does not save that — it makes the claim
_exclusive_, so the rightful tenant could then never be given the hostname at
all.

Entitlement is therefore an **allocation recorded at write time**:

- The platform grants a host to one conference, and only through a
  SERVER-DERIVED label: `provisionOrganization` (the platform-operator wizard and
  the bearer-authenticated provisioning API) for a tenant's first edition, and
  `createEdition` for later ones. Those are the only callers that pass
  `allocatePlatformHosts`, and they pass ONLY hosts derived from the tenant's own
  globally unique org slug — never a hostname anybody typed.
- The `domainVerification` document records the grant (`method:
"platform-owned"`, `conference` = the grantee).
- Every read-time decision requires **both** the recorded allocation and a live
  suffix re-check (`isPlatformAllocated`). Neither half is sufficient: a
  mis-issued record for a host outside the zone grants nothing, and a host in the
  zone with no allocation grants nothing.
- TYPED hostnames never allocate. `updateDomains` and `createEdition` **reject**
  an unallocated in-zone hostname in their payload
  (`findUnallocatedPlatformDomains`) before any write, and
  `ensureDomainVerification` creates no document for one, so even a bypass of the
  mutation guard fails closed. An organizer can therefore never express a claim
  outside their own org's namespace — which is exactly the hijack this prevents.
- `revoked` is refused **before** the allocation check everywhere — routing, the
  allowlist and the admin view — so releasing the claim really does undo the
  grant.

### Minting: what the platform actually hands out

The same suffix that decides what is _in_ the zone decides what the platform
**mints** (`derivePlatformHosts`). A tenant gets **two** hosts, both a **single
label** — which is the whole reason this needs no per-tenant provider work:

```
acme-2026.konf.run    PERMANENT. This edition's own address, forever.
acme.konf.run         The SHORT address of the org's LATEST edition. It MOVES.
```

`*.konf.run` and its alias already cover both. A nested form
(`2026.acme.konf.run`) does **not** work: it needs a per-org wildcard registered
_and_ a deployment aliased to it, and without that last step a visitor gets the
CDN's own "deployment not found" page instead of ours.

| Rule                                          | Why                                                                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Exactly **one label** above the suffix        | What a wildcard certificate covers. Enforced, not assumed: the label regex admits no dots and the host is re-counted against the suffix.      |
| The dated host names the **edition**          | Editions are already addressed per year in the wild, and a retired edition keeps its URL permanently — archive links never break.             |
| Year comes from the edition's `startDate`     | Deterministic; it cannot collide across an org's editions, and across orgs the globally unique org slug already guarantees uniqueness.        |
| No dates yet → the two collapse into one host | A year is a factual claim and the host is permanent. Guessing the current year would strand a December signup on last year's address forever. |
| Reserved labels refused (on the **org slug**) | `www`, `api`, `auth`, `admin`, … The claim is global and permanent, so the platform's own hostnames must never be handed out to a tenant.     |
| Derived **once**, never re-derived            | Renaming the organization afterwards does not move, break or re-issue an address; claims and records are keyed by the hostname itself.        |

There is deliberately **no fallback label** (`-2`, a random suffix) when a minted
host is already claimed. Provisioning refuses instead, naming the host — an
unpredictable address would be permanent too.

**Both hosts are allocated**, each with its own `platform-owned` record naming
the conference that holds it. Being in the zone still grants nothing on its own.

### The short address moves — as a transfer, never as two writes

`domains[]` is a globally unique routing claim, so the short address cannot sit
on two editions at once and must never sit on none. Creating a newer edition
therefore **transfers** it: released from the previous holder and claimed by the
new one **inside the same Sanity transaction**, which is all-or-nothing. Two
separate writes would have an interleaving that leaves the address duplicated (a
routing collision) or lost (an address that resolves nowhere).

`planEditionPlatformHosts` (`src/lib/conference/platformEditionHosts.ts`) decides
it, and `createEdition` stages both halves:

- **Later start date wins** (`shouldTakeLatestHost`). Back-filling a 2024 edition
  after 2026 exists does **not** drag the short address backwards; it gets its own
  dated host and nothing else. Two editions in one calendar year are ordered by
  their actual start dates; an exact tie keeps the incumbent, because a live
  address does not churn without evidence.
- **The dated host never moves.** Only the bare host is ever released, which is
  what makes retiring an old edition to a static archive safe.
- **A foreign holder is a conflict, not a transfer.** The label derives from a
  globally unique org slug, so a holder in another organization is an anomaly and
  the edition is refused rather than the claim stolen.
- **Provisioning never transfers.** It creates an organization's _first_ edition
  and nothing else (a second provisioning under the same slug is refused by
  `isOrgSlugTaken`), so the short address is always claimed fresh there.

### The suffix is configuration

`PLATFORM_DOMAIN_SUFFIX` follows the `PLATFORM_ORG_ID` contract — the platform
is white-labelable, so `konf.run` is a deployment fact, never a constant in the
source.

**Unset means _no_ host is in the platform zone**, never "every host is". Every
rejection path (blank, a bare label such as `run`, a URL, a `:port`) resolves to
`null` and the predicate fails closed on it.

### Matching rules

Comparison is **label-wise**, never `endsWith` on a raw string. "✅" here means
only _allocatable_ — the allocation still has to exist:

| Host                    | `konf.run` suffix | Why                                                                                      |
| ----------------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| `kubeday.konf.run`      | ✅ in zone        | exact trailing labels, one label deeper                                                  |
| `a.b.konf.run`          | ✅ in zone        | still inside the zone                                                                    |
| `evil-konf.run`         | ❌                | `endsWith` says yes; there is no label boundary                                          |
| `konf.run.attacker.com` | ❌                | our zone as somebody else's _prefix_                                                     |
| `a.konf.runner`         | ❌                | different TLD                                                                            |
| `konf.run` (apex)       | ❌                | the platform's own origin, not a minted subdomain — it can prove itself the ordinary way |
| `*.konf.run`            | ❌                | a wildcard over the whole zone would let its holder route every tenant subdomain         |
| `tenant.konf.run:3000`  | ❌                | a port is a dev entry, not a zone                                                        |

The suffix half of the verdict is re-derived **live** on every decision rather
than trusted from the record alone, so re-pointing or unsetting the suffix
withdraws the standing immediately instead of leaving stale grants behind.

### What it affects

- **Routing** — served because the record carries the allocation. There is no
  suffix short-circuit: a missing record still fails closed, exactly as for a
  custom domain, and the host must be claimed in this conference's `domains[]`.
- **Redirect allowlist** — eligible. The threat the allowlist guards is a
  _dangling_ destination: a third party's zone lapses and the host silently
  resolves to somebody else. That cannot happen inside a zone we operate, and
  refusing would mean nobody on the platform's default hosting could complete a
  sign-in. What it grants is a redirect destination to the conference the
  platform **issued** that subdomain to — not to whoever typed it first.
  Wildcards and revoked claims stay excluded.
- **The sweep** — never resolves an allocated record. Doing so would hard-fail
  the entire platform-hosted estate and alert every organizer about a record they
  cannot publish. Allocated records are reconciled to `verified`/`platform-owned`
  (clearing any stale `graceUntil`) and counted separately (`platformOwned` in
  the summary). An **unallocated** in-zone claim is resolved like any other, hard
  fails, and stays unrouted.
- **Custom domains** — completely unaffected. They still require real DNS-TXT
  proof, whether or not a platform suffix is configured.

## Data model

A **sidecar document** (`sanity/schemaTypes/domainVerification.ts`), one per
hostname, addressed by a deterministic `_id`. `domains[]` itself is untouched —
it stays an array of plain strings.

That was deliberate: `domains[]` is the tenant ROUTING key, read by
`getConferenceForDomain`'s GROQ, the overlap matcher, `createEdition`,
onboarding, `updateDomains` and the PWA manifest. Restructuring it into objects
would touch every one of those at once — including the live routing query — for
no gain, because verification state is written by a background job on a
completely different cadence than the claim itself. Keeping them apart also means
a verification write can never corrupt routing data.

When a hostname is released and re-claimed by a **different** conference, the
record is reset with a **fresh token**: the new holder must never inherit the old
holder's proof.

## Delisting policy

Two consumers, deliberately different tolerances (`src/lib/domain-verification/policy.ts`):

|                      | Redirect allowlist               | Routing                                             |
| -------------------- | -------------------------------- | --------------------------------------------------- |
| Posture              | strict, fail closed              | forgiving                                           |
| Cost of being wrong  | one refused login bounce         | the tenant's site goes dark                         |
| First hard failure   | **delisted immediately**         | still served                                        |
| Withdrawal threshold | —                                | 3 consecutive hard failures **and** a ≥7-day streak |
| Stale success        | expires after 30 days            | keeps serving indefinitely                          |
| Wildcard claims      | never eligible (exact host only) | eligible                                            |
| Dev/loopback entries | never eligible                   | always eligible                                     |
| Platform-ALLOCATED   | always eligible (permanent)      | always eligible (permanent)                         |
| In-zone, unallocated | never eligible                   | never eligible (and refused at the claim)           |

DNS failures are classified:

- **Hard** — DNS answered and the proof is gone (NXDOMAIN, NODATA, or a TXT set
  without our token). The dangling-DNS signal; the only thing that may cost a
  domain its standing.
- **Soft** — we could not get an answer at all (timeout, SERVFAIL, network).
  That is our outage, not the tenant's, and never delists on its own. Escalates
  to hard only after 5 consecutive soft failures.

Withdrawal is never destructive: nothing mutates `domains[]`. We stop _honouring_
a claim; republishing the record restores it on the next sweep.

The allowlist is exact-host and does **not** reuse `domainServesHost` /
`domainEntriesOverlap`. Routing intentionally resolves `sub.example.com` through
a `*.example.com` claim; prefix or wildcard matching for redirect destinations is
the canonical code-exfiltration chain (RFC 6819 §4.1.5/§5.2.3.5, RFC 9700
§2.1/§4.1.3).

## Enforcement rollout

Routing enforcement is behind `DOMAIN_VERIFICATION_ENFORCE_ROUTING=true` and is
**off by default**. The pre-existing production claims must be backfilled first,
or the live sites would go dark:

```
pnpm tsx scripts/backfill-domain-verification.ts          # dry run
pnpm tsx scripts/backfill-domain-verification.ts --apply
```

The backfill mints `method: "grandfathered"` records, honoured for 30 days and no
longer — a time-boxed exemption, not an amnesty. It does **not** allocate: a
pre-existing claim under `PLATFORM_DOMAIN_SUFFIX` gets no record from it, and
must be allocated deliberately (or removed). The admin card shows the deadline
and the record to publish; the daily sweep starts reporting the missing TXT
immediately.

The redirect allowlist is **not** flag-gated. It is a new surface with no
existing consumers, so it fails closed from day one.

## Moving parts

| Path                                              | Role                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/domain-verification/challenge.ts`        | record names, tokens, host classification                               |
| `src/lib/domain-verification/platform.ts`         | the `PLATFORM_DOMAIN_SUFFIX` contract, label-wise matcher, host minting |
| `src/lib/onboarding/provision.ts`                 | claims + allocates the minted host in the tenant transaction            |
| `src/lib/domain-verification/dns.ts`              | bounded, uncached TXT resolution + hard/soft classification             |
| `src/lib/domain-verification/policy.ts`           | the delisting policy (pure)                                             |
| `src/lib/domain-verification/allowlist.ts`        | exact-host OAuth redirect allowlist (#688 consumes this)                |
| `src/lib/domain-verification/routing.ts`          | the flag-gated routing gate                                             |
| `src/lib/domain-verification/sweep.ts`            | continuous re-verification + organizer alerts                           |
| `src/app/api/cron/domain-verification/route.ts`   | daily cron (05:00 UTC)                                                  |
| `src/server/routers/domainVerification.ts`        | admin list + re-check                                                   |
| `src/components/admin/DomainVerificationCard.tsx` | `/admin/settings#domain-verification`                                   |

DNS resolution uses a dedicated `node:dns` `Resolver` with an explicit timeout
and a fixed `tries`, plus an outer wall-clock race. Nothing about verification is
cached — not the DNS answers, not the Sanity reads. A cached allowlist is a
delisting that has not taken effect.
