# LinkedIn API for organization-page posting and engagement

Research for [#930](https://github.com/CloudNativeBergen/website/issues/930) (parent: [#929](https://github.com/CloudNativeBergen/website/issues/929), Marketing Plan slice 1).
Sources are LinkedIn's own developer documentation on `learn.microsoft.com/linkedin` (the Marketing
Developer Platform docs) and LinkedIn's legal/terms pages. Everything below is cited; nothing is
inferred from blog posts or SDK READMEs.

> Note on placement: `docs/` in this repo is otherwise flat (`docs/TICKET_SYSTEM.md`,
> `docs/INTEGRATION_ADAPTERS.md`, …). This file lives in `docs/research/` because the ticket asked
> for that path and because it is background research rather than a description of shipped code.

## Short answer

Yes — posting to a conference's LinkedIn **organization page** and reading **per-post engagement**
is a documented, supported capability. But every scope needed for it belongs to the **Community
Management API**, which is gated behind a LinkedIn application review that requires a registered
legal organization, a verified business email, a LinkedIn Page that has verified the developer app,
and a "commercial use case". Nothing about organization pages is available without that approval:
the only open, self-serve write scope on the whole platform is `w_member_social`, which posts as
the authenticated **person**, not as the Page.

Even once approved, the default **Development tier** is capped at **500 API calls per app per 24 h**
and **100 per member per 24 h**, with **all `BATCH_GET` endpoints disabled** and **social-action
webhooks disabled**; production use needs a separate **Standard tier** application backed by a
narrated screencast of the finished integration.

## 1. The API product and its surface

### Posting

`POST https://api.linkedin.com/rest/posts` with `"author": "urn:li:organization:{id}"` creates an
organic post on a Page. Required headers are `Linkedin-Version: {YYYYMM}` and
`X-Restli-Protocol-Version: 2.0.0`. A `201` returns the post URN in the `x-restli-id` response
header (`urn:li:share:…` or `urn:li:ugcPost:…`). Text, image, video, document, article, multi-image
and poll posts are supported organically; carousels are sponsored-only. Posts can be updated
(`X-RestLi-Method: PARTIAL_UPDATE`, only `commentary`, CTA label, landing page, `lifecycleState`)
and deleted. Organization mentions and hashtags go inline in `commentary` as
`@[Name](urn:li:organization:123)` / `#tag`.
— [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)

Notable constraint for a "schedule a post" feature: `lifecycleState` is **`PUBLISHED` only** at
creation time. `DRAFT` and `PUBLISH_REQUESTED` are documented as *response* values, not accepted
inputs. There is **no server-side scheduling** — our own cron has to fire at the scheduled minute.
— [Posts API → Update Posts](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)

Also relevant: the Posts API deliberately **does not scrape URLs** for article posts. To post a link
with a card, we must supply `article.source`, `title`, `description` and a `thumbnail` image URN
uploaded through the Images API ourselves.
— [Posts API → Article Post Creation](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)

### Reading engagement

Two different endpoints, with **different scopes**, and we likely want both:

| What | Endpoint | Scope |
| --- | --- | --- |
| Impressions, unique impressions, clicks, likes, comments, shares, engagement rate — per post or aggregate | `GET /rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity={orgUrn}&shares=List(…)` | `rw_organization_admin` |
| Live reaction/comment counts and the comment bodies + commenter URNs | `GET /rest/socialActions/{postUrn}` and `…/comments`, `…/likes` | `r_organization_social_feed` (org), `r_organization_social` on the older Posts-API surface |
| Page follower count | `GET /rest/networkSizes/{orgUrn}?edgeType=COMPANY_FOLLOWED_BY_MEMBER` | `rw_organization_admin` |

— [Share Statistics](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics),
[Network Update Social Actions](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/network-update-social-actions),
[Organization Lookup](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-lookup-api)

`organizationalEntityShareStatistics` is the one that answers "how did this post do". Caveats
straight from the doc:

- Organic only — sponsored activity is excluded (that needs Ad Analytics).
- **Rolling 12-month window**: "returns share data only within the past 12 months".
- Per-share and per-ugcPost queries support **lifetime statistics only** — no time-bound breakdown
  for a specific post.
- No pagination on the endpoint.
- Posts with zero activity are simply **omitted from `elements`**; absence means zero, not an error.
- LinkedIn itself points at `socialActions` for "up-to-date counts of likes and comments … that
  matches the LinkedIn feed" — i.e. the statistics endpoint lags.

A repost count exists as `shareCount`, and the doc warns time-bound `shareCount` will not match
lifetime `shareCount` because instant reposts are excluded from the time-bound figure.

## 2. Scopes

The full set, with the products that grant them:

| Scope | Meaning | Granted by |
| --- | --- | --- |
| `w_organization_social` | Post, comment, like **as the organization**. Member must hold `ADMINISTRATOR`, `DIRECT_SPONSORED_CONTENT_POSTER` or `CONTENT_ADMIN` on the Page. | Community Management API, Advertising API |
| `r_organization_social` | Read the organization's posts, comments, likes. Same role restriction. | Community Management API, Advertising API |
| `rw_organization_admin` | Manage Pages and **retrieve reporting data**. Member must be `ADMINISTRATOR`. | Community Management API, Advertising API |
| `r_organization_social_feed` / `w_organization_social_feed` | Read/manage social actions (comments, reactions) for administered organizations. | Community Management API only |
| `w_member_social` | Post as the **person**. | **Open, self-serve** (Share on LinkedIn) — also in CM/Ads |

— [Increasing Access → API Products and Permissions](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access),
[Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)

Two things worth internalising:

1. **Scope grant ≠ page access.** Approval grants the *app* the scopes; the *member* who does OAuth
   must separately hold the right Company Page role. A `403 ACCESS_DENIED` on `/rest/posts` means
   either the scope or the page role is missing. So the organizer who connects LinkedIn in our admin
   must be a Page admin, and if they leave the org the connection dies with their role.
2. **Changing the scope set invalidates existing tokens.** "If you request a different scope than the
   previously granted scope, all the previous access tokens are invalidated" — every organizer has to
   re-consent whenever we add a scope. Worth requesting the full set on day one.
   — [3-legged OAuth](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)

## 3. What is possible with **no** approval

Only `w_member_social`, `profile` and `email`, via the self-serve products *Share on LinkedIn* and
*Sign in with LinkedIn using OpenID Connect*. "Open Permissions are the only permissions that are
available to all developers without special approval."
— [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)

Concretely, with zero approval we could let an organizer post **from their own personal profile**
and nothing more — no Page posting, no Page analytics, not even the Page follower count. That is not
the feature #929 describes, and posting conference announcements from a personal account is a
different product decision, not a fallback.

## 4. Is partner review mandatory, and how long?

**Mandatory.** "To access the Community Management APIs, every developer must complete an access
request form(s) which LinkedIn will review and vet the developer and app."
— [Community Management App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review)

Development-tier checklist, all required:

- Registered **legal organization**; "our Community Management APIs are only available to registered
  legal organizations for **commercial use cases only**".
- Verified **business** email address — "Personal email addresses won't pass the vetting process."
- Verified organization legal name, registered address, website/domain, privacy policy.
- A **super admin of the LinkedIn Page must verify the app** (the Page↔app association step).
- App name must not contain any part of "LinkedIn" or "Microsoft" (including "Linked" or "In").
- Use case must not be a [restricted one](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases).

**Rejection is terminal for that app**: "If your application is rejected … create a new app, and
submit a new Development tier access request form. You won't be able to re-apply for Development
tier access with your existing app." Same rule for Standard tier — a Standard rejection sends you
back to creating a **new app** and re-doing Development tier.

**Standard tier** additionally requires a full working integration plus a high-resolution, narrated,
downloadable **screencast** demonstrating, for a Page Management use case: the complete OAuth flow,
a user posting to their Page through our app, how a member's comment on that post is displayed, and
exactly which personal data fields from the commenter's profile we display. Page Analytics use cases
must demonstrate post performance display too.

**Timeline: LinkedIn does not publish one.** No SLA or business-day figure appears anywhere in the
app-review, increasing-access, or quick-start documentation. The only timing statement in the docs is
about the *restricted* products: "Restricted APIs are evaluated on a case-by-case basis with no fixed
timeline". Community Management is not restricted — it is "available to all developers approved for
Community Management API access" — but that still means an unbounded review queue plus, for Standard
tier, a second review that cannot even begin until the integration is finished. **Treat the calendar
cost as unknown and sequential, not as a sprint task.** Anyone quoting "a few days" is quoting
folklore, not documentation.

There is also a clock on the grant: Development tier expects developers to "build core business use
cases … **within twelve (12) months** of the provisioning."
— [Increasing Access → How to Upgrade your Access Tier](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access)

## 5. Tokens

- **Access token: 60 days.** "Currently, all access tokens are issued with a 60-day lifespan."
- **Programmatic refresh tokens: 365 days**, and they are **not self-serve** — "Programmatic refresh
  tokens are available for a limited set of partners" / "LinkedIn supports programmatic refresh
  tokens for all approved Marketing Developer Platform (MDP) partners." Refreshing mints a new
  60-day access token but **does not extend** the refresh token's original 365-day TTL; at day 365
  the member must re-authorize through the full OAuth flow.
- Without programmatic refresh tokens the only "refresh" is re-running the authorization redirect,
  which silently bypasses the consent screen **only if** the member is still logged in to LinkedIn
  **and** their current access token has not yet expired. That is a browser round-trip, so it cannot
  be done from a cron job.
- LinkedIn "reserves the right to revoke Refresh Tokens or Access Tokens at any time"; the documented
  expectation is to fall back to the login screen.

— [3-legged OAuth](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow),
[Programmatic Refresh Tokens](https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens)

**Implication for us:** a conference posts in bursts around CFP, programme announcement and the event
itself. A 60-day access token with a hard 365-day re-consent means the Marketing Plan needs a visible
"LinkedIn connection expires on ⟨date⟩ — reconnect" state in admin, plus a proactive reminder, or the
first campaign after a quiet period will fail silently. We have no OAuth token store today (per #929,
`SecretFamily` bags hold static secrets and never live in Sanity), so slice 1 would have to build
one: encrypted refresh + access token per conference, with expiry tracking.

## 6. Rate limits

- Limits are per 24 h, **reset at midnight UTC**, and are enforced at two levels: **application**
  (total calls by our app) and **member** (calls per member token).
- Exceeding them returns **429**. LinkedIn may also return 429 for infrastructure protection.
- **Standard limits are not published**; you look up the per-endpoint limit in the Developer Portal's
  Analytics tab, and only for endpoints you have already called at least once that UTC day.
- Developer admins get email alerts at **75%** of an app-level quota, delayed **1–2 hours**, and
  app-level only — member-level breaches are not alerted.
- Comment creation has an additional **short-term one-minute** rate limit
  (`429 Comment create throttled: creation rate limit exceeded for member`).

— [Rate Limiting](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits),
[Network Update Social Actions → Common Creation Errors](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/network-update-social-actions)

The **Development-tier** numbers are published and are the binding ones early on: **500 calls per app
per 24 h**, **100 calls per member per 24 h**, **zero `BATCH_GET` calls allowed**, **social-action
webhooks disabled**.
— [Increasing Access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access)

That `BATCH_GET` ban matters more than the raw call count. Batch-fetching statistics for N posts is
the natural design; on Development tier it is unavailable, so an engagement poller must issue one
call per post. At 100 calls/member/day, polling ~20 tracked posts is ~20 calls per sweep — fine
hourly, tight if we also poll comments per post.

## 7. Terms constraints that shape the feature

These are hard product constraints, not footnotes
([Restricted Use Cases](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases),
[Data Storage Requirements](https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements)):

- **No social feeds.** "None of the data provided via our Community Management APIs can be used in a
  social feed use case (e.g. to display a feed of LinkedIn company updates on the company's website
  or intranet)." So: no rendering LinkedIn posts on the public conference site from this API. Admin-
  side display to Page-associated organizers is the permitted shape.
- **Limited audience.** Member data "may only be displayed to individuals associated with that Page
  or Profile" — i.e. admin-only, never public.
- **Retention ladder.** Organization Pages' admin and reporting data (follower counts, summaries of
  social actions, visitor info; explicitly *not* member-level): **one year**. Organization social
  activity (our own posts) from an authenticated organization: **six months**. Members' social
  activity — the *content* of a member's comment: **48 hours**. Other members' profile data (a
  commenter's name/photo): **24-hour cache, storing not permitted**. Org/post/social-action **URNs**
  and authenticated members' own profile data: no duration restriction.
- **No combining member data** with our data to enrich profiles, and no export of member data out of
  the application.

Read together: we may durably store post URNs and the numeric `organizationalEntityShareStatistics`
metrics — that is exactly the "channel engagement" #929 wants, and it is safely inside the one-year
reporting bucket. We may **not** durably store commenter names or comment text; showing comments in
admin means fetching them live (or caching ≤24/48 h) and never persisting them into Sanity.

## 8. Versioning maintenance cost

Every call must send `Linkedin-Version: YYYYMM`. Versions are sunset on roughly a 12-month cadence —
the current docs carry a banner that 202508 sunsets on **17 August 2026**. So this integration
carries a standing yearly chore: bump the version header and re-test. That is a real ongoing cost for
a volunteer-run conference platform and belongs in the decision, not just the backlog.
— [Posts API deprecation banner](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)

## 9. Recommendation

**Do not put the LinkedIn API integration in slice 1. Ship LinkedIn as the manual Task flow, and run
the Community Management API application in parallel as its own track.**

Reasons, in order of weight:

1. **Slice 1 cannot be unblocked by engineering effort.** Every organization-page scope sits behind a
   LinkedIn review with no published timeline, and the *production* tier additionally demands a
   finished, screencast-demonstrable integration. Even in the best case the ordering is: build →
   apply → wait → record screencast → apply again → wait. Making slice 1 depend on that makes slice
   1's ship date a function of LinkedIn's queue.
2. **A rejection is expensive and irreversible per app.** We cannot iterate on the application. The
   "commercial use cases only" wording is a genuine risk for a community conference; the application
   deserves a careful, deliberate framing (Page Management + Page Analytics for our own conference
   Pages) rather than being rushed to unblock a sprint.
3. **The manual flow is needed anyway.** Development tier bans `BATCH_GET` and caps calls; token
   revocation, 60-day expiry and the 365-day re-consent wall all mean the API path will fail
   sometimes. A Task that an organizer can complete by hand — copy the composed text, open the Page,
   post, paste the post URL back — is the permanent fallback, not throwaway scaffolding. Build it
   once, in slice 1.
4. **Most of the value survives without the API.** #929 measures effectiveness as "channel-native
   engagement **plus** our own link attribution". The attribution half (UTM capture → Pirsch) is
   entirely ours and needs no LinkedIn approval. Pasting back the post URL gives us the post URN for
   free, so an engagement backfill later is a pure additive job over rows that already exist.

**Concretely for slice 1:**

- Model the LinkedIn Task with a `channel`, composed `content`, a `scheduledAt`, an approval state,
  and a nullable **`externalPostUrl` / `externalPostUrn`** the organizer pastes back after posting.
  That field is the seam: an API integration later fills it automatically instead of manually.
- Put LinkedIn behind the `docs/INTEGRATION_ADAPTERS.md` provider interface from the start, with a
  `ManualChannelProvider` as the first implementation. Credentials injected at construction, nothing
  ambient — the house rule. A `LinkedInApiProvider` slots in later with no call-site change.
- Do the UTM/attribution work in slice 1. It is unblocked and it carries the measurement story.
- **Start the Community Management API Development-tier application now**, as a separate non-blocking
  ticket: business email on the cloudnativebergen domain, legal entity details, privacy policy URL,
  and a Page super admin verifying the app. Its output is an approval, not code.
- Design the token store (encrypted per-conference refresh + access token, expiry surfaced in admin)
  as a slice-2 item, informed by the 60-day / 365-day realities above rather than discovered by them.

**Revisit** when Development tier is granted: at that point build `LinkedInApiProvider` behind the
same interface, keep the manual path as the documented fallback, and only then decide whether the
Standard-tier screencast round is worth it — the 500-call/day Development cap is plausibly enough for
a handful of conference Pages posting a few dozen times a year, and staying on Development tier for
the first year is a legitimate option as long as we remember the 12-month build window.

## Sources

- [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)
- [Organization Share Statistics](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics)
- [Network Update Social Actions](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/network-update-social-actions)
- [Organization Lookup](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-lookup-api)
- [Increasing Access (products, tiers, permissions table)](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access)
- [Community Management App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review)
- [Getting Access to LinkedIn APIs (open permissions)](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
- [LinkedIn 3-legged OAuth Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [Programmatic Refresh Tokens](https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens)
- [API Rate Limiting](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits)
- [Restricted Uses of LinkedIn Marketing APIs and Data](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases)
- [Marketing API Program Data Storage Requirements](https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements)

Retrieved 2026-09-01; the Marketing docs default to version `li-lms-2026-08`.
