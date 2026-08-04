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

## Platform-owned hosts

Tenants are hosted by default on a subdomain the platform **mints** for them
(`<slug>.konf.run`). That zone's nameservers are delegated to our own edge and a
wildcard certificate covers every label under it — the tenant has no access to it
at all. Asking them for a `_konf-challenge` TXT record there is asking them to
write into a zone only we can write to, so under routing enforcement every
platform-hosted tenant would simply go dark.

A host under the configured platform suffix is therefore verified **by
construction**, recorded as `method: "platform-owned"`. Unlike `grandfathered`
this is **permanent**: no `graceUntil`, no staleness expiry, nothing for the
tenant to complete.

### The suffix is configuration

`PLATFORM_DOMAIN_SUFFIX` follows the `PLATFORM_ORG_SLUG` contract — the platform
is white-labelable, so `konf.run` is a deployment fact, never a constant in the
source.

**Unset means _no_ host is platform-owned**, never "every host is". Every
rejection path (blank, a bare label such as `run`, a URL, a `:port`) resolves to
`null` and the predicate fails closed on it.

### Matching rules

Comparison is **label-wise**, never `endsWith` on a raw string:

| Host                    | `konf.run` suffix | Why                                                                                      |
| ----------------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| `kubeday.konf.run`      | ✅ owned          | exact trailing labels, one label deeper                                                  |
| `a.b.konf.run`          | ✅ owned          | still inside the zone                                                                    |
| `evil-konf.run`         | ❌                | `endsWith` says yes; there is no label boundary                                          |
| `konf.run.attacker.com` | ❌                | our zone as somebody else's _prefix_                                                     |
| `a.konf.runner`         | ❌                | different TLD                                                                            |
| `konf.run` (apex)       | ❌                | the platform's own origin, not a minted subdomain — it can prove itself the ordinary way |
| `*.konf.run`            | ❌                | a wildcard over the whole zone would let its holder route every tenant subdomain         |
| `tenant.konf.run:3000`  | ❌                | a port is a dev entry, not a zone                                                        |

The verdict is re-derived **from the hostname** on every decision rather than
read off the record's stored `method`, so re-pointing or unsetting the suffix
withdraws the standing immediately instead of leaving stale grants behind.

### What it affects

- **Routing** — served unconditionally, including when the sidecar document is
  missing entirely (`routing.ts` short-circuits before its fail-closed rule).
  The host must still be claimed in this conference's `domains[]`.
- **Redirect allowlist** — eligible. The threat the allowlist guards is a
  _dangling_ destination: a third party's zone lapses and the host silently
  resolves to somebody else. That cannot happen inside a zone we operate, and
  refusing would mean nobody on the platform's default hosting could complete a
  sign-in. What it grants is a redirect destination to whoever holds a
  `<label>.<suffix>` claim — co-extensive with "we host that tenant there", so
  the control is who may claim a platform subdomain, not a DNS proof they could
  never produce. Wildcards and revoked claims stay excluded.
- **The sweep** — never resolves these records. Doing so would hard-fail the
  entire platform-hosted estate and alert every organizer about a record they
  cannot publish. They are reconciled to `verified`/`platform-owned` instead and
  counted separately (`platformOwned` in the summary).
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
| Platform-owned hosts | always eligible (permanent)      | always eligible (permanent)                         |

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
longer — a time-boxed exemption, not an amnesty. Hosts under
`PLATFORM_DOMAIN_SUFFIX` are exempt from that deadline: the hostname decides the
method, so they are minted `platform-owned` no matter what the caller asks for. The admin card shows the
deadline and the record to publish; the daily sweep starts reporting the missing
TXT immediately.

The redirect allowlist is **not** flag-gated. It is a new surface with no
existing consumers, so it fails closed from day one.

## Moving parts

| Path                                              | Role                                                        |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `src/lib/domain-verification/challenge.ts`        | record names, tokens, host classification                   |
| `src/lib/domain-verification/platform.ts`         | the `PLATFORM_DOMAIN_SUFFIX` contract + label-wise matcher  |
| `src/lib/domain-verification/dns.ts`              | bounded, uncached TXT resolution + hard/soft classification |
| `src/lib/domain-verification/policy.ts`           | the delisting policy (pure)                                 |
| `src/lib/domain-verification/allowlist.ts`        | exact-host OAuth redirect allowlist (#688 consumes this)    |
| `src/lib/domain-verification/routing.ts`          | the flag-gated routing gate                                 |
| `src/lib/domain-verification/sweep.ts`            | continuous re-verification + organizer alerts               |
| `src/app/api/cron/domain-verification/route.ts`   | daily cron (05:00 UTC)                                      |
| `src/server/routers/domainVerification.ts`        | admin list + re-check                                       |
| `src/components/admin/DomainVerificationCard.tsx` | `/admin/settings#domain-verification`                       |

DNS resolution uses a dedicated `node:dns` `Resolver` with an explicit timeout
and a fixed `tries`, plus an outer wall-clock race. Nothing about verification is
cached — not the DNS answers, not the Sanity reads. A cached allowlist is a
delisting that has not taken effect.
