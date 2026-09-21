# Short links for tagged marketing links

Decided in a design interview on 2026-09-21 and revised the same day after an adversarial review
against the code (§6). Amends [`MARKETING_PLAN_SPEC.md`](./MARKETING_PLAN_SPEC.md) §3.4, where the
tagged link is what gets posted.

## 1. What changes

A tagged link is ugly twice: in the post, and in the address bar after the click.

```
https://cloudnativebergen.dev/program?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=speakerCard%3Asp-1%3Abluesky
```

Bluesky hides it in the link card unless the copy writes `{url}` into the body. LinkedIn cannot: the
link is appended to the body today and becomes the first comment, alone, under
[`LINKEDIN_VIA_BUFFER_SPEC.md`](./LINKEDIN_VIA_BUFFER_SPEC.md) §3.1. Outreach cannot either: `{url}`
is plain message text that a speaker or sponsor pastes into their own post.

Two independent changes:

- **What we post becomes `https://<conference domain>/go/<code>`** (§2), which redirects to the
  tagged link. Attribution is untouched: the visitor still lands on a URL carrying the four `utm_*`
  parameters that PostHog, the ledger and the CFP first-touch stash read.
- **The landing page removes `utm_*` from the address bar** once they have been captured (§3).

Not in this work, each a decision and not an omission:

- **Click counting on the redirect.** It would see visitors who never consent, which is its appeal
  and its cost: a store that is not Sanity (250k requests a month rules out a write per click), a
  preview-crawler filter, a `/privacy` change, and an uncacheable redirect, where §2.5 depends on a
  cacheable one. Nothing here blocks adding it.
- **Vanity links** (`/go/cfp` on a slide or a sticker). A different object: not per Channel, not
  tied to a Task, outlives a Campaign. `/go/` leaves room — a vanity word can share the path as
  long as it can never match the code shape in §2.2.
- **A third-party shortener.** A foreign domain costs trust, needs an account per organization, and
  puts click data in a second place.
- **Short links for standalone social posts.** Their `link` is typed by the organizer and may point
  anywhere; only a Task's link is ours to shorten.
- **An in-app way to retarget a published link** (§2.6).

## 2. The short link

### 2.1 The stored tagged link does not change; the variant gains a code

`socialPostVariant.link` stays exactly what it is today: the long tagged URL, rewritten on every
save of the Task editor while the variant is editable. It is more than a link. Published variants
are designed to outlive their Task — a plan delete and reseed keeps them — and two readers recover
the Campaign and Task keys by parsing `utm_*` out of that stored link: `publishedTaskKeys`, the
dedupe that stops seed, expansion and Triggers from regenerating a published post, and the Snapshot
ledger's attribution of orphaned publications. Neither changes.

A Task-owned `socialPostVariant` gains `shortCode` (string, read-only in Studio). `/go/<code>`
redirects to **that variant's stored `link`**. The variant is the durable record, so a posted short
link survives everything a posted long link survives today, including the deletion of its Task.

An outreach Task has no variant. `marketingTask.shortCode` is set for outreach Tasks only, and the
redirect derives their target through `taggedUrl()` with `utm_source=outreach`.

**Known hole.** Deleting a sent outreach Task sends its link to the home page (§2.4). The deletion
preview says so (§2.7).

### 2.2 The code

Six characters from `abcdefghjkmnpqrstuvwxyz23456789` — lowercase, without `0 o 1 l i`. Random,
unique within the conference across both document types, never changed once minted, not editable
anywhere. About 887 million codes per conference.

`materializeTask` is pure and builds whole batches, so it cannot mint: **its callers mint and pass
the codes in**, as they already do for ids. A batch mint draws the codes it needs, checks them
against the conference's existing codes in one query and against each other, and redraws any hit.
Seeding, expansion, Triggers, copy-to-new-edition and the add-task mutation all go through this; a
copied Task's variant gets a NEW code, never the source's (the copy projection lists its fields, so
the field cannot ride along by accident — keep it that way).

A variant or outreach Task that predates the field gets its code in the first **mutation** that
needs the link — variant save, approve, outreach send. Never in a query, and never client-side.

**Known hole.** Sanity has no unique constraint, so two concurrent mints could pick the same code
and the redirect would follow whichever document the query returns first. At these odds it is
accepted; the fix, if ever needed, is a deterministic-`_id` claim document.

### 2.3 What is posted

The short URL, built from `conferenceBaseUrl()` and the code, everywhere a reader can see a link:
the Bluesky embed `uri`, a `{url}` resolved into body copy, the LinkedIn body or first comment, the
copy-ready view, the outreach `{url}`. The publisher and those views build it from the variant's
code; they stop reading `link` as the thing to show.

`link` keeps its other jobs. The Bluesky link-card scraper reads Open Graph tags from it — the
scraper does not learn to follow `/go/`. `taggedUrl()` throwing stays the validation of a
destination at approve and at outreach send.

Body copy now holds the short URL where `{url}` was resolved. Copy-to-new-edition replaces the
source's link inside edited copy today; it must replace the source's SHORT URL with the new one.

A link in the body costs a fixed `origin + /go/ + 6` characters; the LinkedIn manual-copy length
check counts that. `sitePathIssue` refuses a `targetPage` under `/go/`, so a link never points at a
link.

### 2.4 The route

`GET /go/<code>`, answered on every domain of the conference.

| Request                                                                   | Response                                 |
| ------------------------------------------------------------------------- | ---------------------------------------- |
| Code does not match `^[a-hjkmnp-z2-9]{6}$` after lowercasing              | 404. Sanity is not touched.              |
| A variant in THIS conference has it, and its `link` is on this conference | 302 to the variant's `link`              |
| An outreach Task in THIS conference has it, and its target derives        | 302 to `taggedUrl()`                     |
| Well-formed, nothing in this conference has it                            | 302 to the conference home page, no UTMs |
| Found, but the `link` is off-domain or malformed, or `taggedUrl()` throws | 302 to the conference home page, no UTMs |

The code is lowercased before the shape check: some clients capitalise a pasted link. A code that
belongs to another conference is simply unknown here — the lookup is scoped by the conference the
host resolves to, so the two cases are indistinguishable from outside.

**Never an open redirect.** `link` is a stored string that Studio can edit. The route redirects
only to a URL whose host is one of the conference's own domains.

302, never 301 or 308: a permanent redirect is pinned by browsers and would survive a repaired link
(§2.6). `Cache-Control: no-store`, `X-Robots-Tag: noindex`.

A person who clicked a real post always reaches the conference. A scanner costs nothing. A removed
destination page is the site's own 404 — the redirect does not second-guess the link.

### 2.5 Caching

Every click would otherwise be a Sanity read. The lookup `(conferenceId, code) → target | null`
follows the repo's wrapper pattern: the route reads the host and resolves the conference, the inner
function is cached with a tag per document and a one-day life. A miss is cached too, on a short
life, so a dead code in a popular post cannot drain the quota; a miss carries no document tag, which
is tolerable only because its life is short.

Two things the plain form gets wrong here:

- **Plain `'use cache'` is in-memory and does not persist across serverless invocations.** The
  lookup needs the remote cache (`'use cache: remote'` or the configured cache handler — read
  `node_modules/next/dist/docs` for this Next version before choosing).
- **`revalidateTag` must expire the entry, not serve it stale.** Every write that changes a target
  invalidates: a variant save that rewrites `link`, an outreach Task's `targetPage` write, and the
  deletion of an outreach Task — including inside plan and Campaign chunk deletes, per Task.

Steady state is one read per code per day, whatever the click count. A Studio edit is seen within a
day.

**Acceptance is the request log, not a unit test.** Caching has been found silently ineffective on
this project before. The slice is done when repeated hits on one code, on a Vercel preview, show
ONE Sanity read in the exported request log.

### 2.6 Changing a posted link's destination

The redirect follows whatever `link` the variant holds, so there is one rule and no second source
of truth. A `published` variant cannot be edited in the app, so its destination is fixed. A `failed`
variant can — and a stale publishing claim can end `failed` with the post actually live — and there
the posted short link follows the corrected destination, which is the behaviour an organizer fixing
that Task wants. An outreach Task's destination is editable only while it is open and unsent.

Emergency repair of a published post: edit the variant's `link` in Studio; every posted copy
follows within a day (§2.5).

Follow-up, to build the first time it is actually needed: a narrow retarget mutation for a published
variant that validates through `taggedUrl()`, confirms, rewrites `link` and expires the tag.

### 2.7 The Task editor

Shows the short link and, under it, the destination it expands to, so nobody has to click through
to see where a link goes. Deleting a sent outreach Task warns that its link will fall back to the
home page; it warns, it does not block. A publishing Task needs no such warning — its published
variant, and so its link, survives the delete.

## 3. The address bar

After the redirect the visitor is on the long URL. Three readers need it first:

- **PostHog, cookieless.** A visitor who never consents is attributed through the server session's
  entry UTMs, which come from the SDK's own first `$pageview` reading the address bar
  (`src/lib/posthog/config.ts`, #1000). **Stripping before that pageview would unattribute every
  non-consenting visitor.** The pageview is observable: `posthog.on('eventCaptured')`.
- **PostHog, on Accept.** `initTenantAnalytics` holds the landing UTMs in memory from before init.
  But `opt_in_capturing()` fires a fresh `$pageview` BEFORE they are replayed with
  `register_for_session`, and today that pageview gets its UTMs from the address bar. After a strip
  it would carry none, in a new client session with no entry UTMs. **The landing UTMs must be
  registered before opting in**, so the opt-in pageview carries them.
- **CFP first touch.** `landing-utm.ts` stashes to `sessionStorage` on landing.

So, in order: the CFP stash is written; the SDK's first `$pageview` is captured; then
`history.replaceState` to the same URL without the five `utm_*` parameters, every other parameter
and the hash kept. Where analytics is not configured or the route is analytics-excluded, there is
no pageview to wait for and the strip is immediate. A ~3 s timeout strips anyway when the SDK is
blocked or slow: those visitors were never going to be attributed.

This applies to every landing with `utm_*`, not only arrivals through `/go/`.

**Acceptance is a real browser, not a mocked SDK.** A cookieless visit through a tagged link must
still produce `$entry_utm_campaign` and `$entry_utm_content` in PostHog; a visit that accepts AFTER
the strip must produce an opt-in pageview and later events carrying the campaign; the address bar
is clean in both.

## 4. Existing data

Production has no `marketingTask` and no `socialPostVariant` documents (queried 2026-09-21; drafts
are invisible to that query). No migration. The mutation-time mint (§2.2) covers anything that
predates the field.

## 5. Slices

1. **`/go/<code>` resolves** — the two `shortCode` fields, caller-side minting, the route (§2.4)
   and its cache (§2.5). Nothing posts a short link yet.
2. **What we post is the short link** — §2.3 and the editor display (§2.7). Lands before or with the
   first-comment slice ([#1134](https://github.com/CloudNativeBergen/website/issues/1134)).
3. **Outreach delete warning** — §2.7.
4. **Clean address bar** — §3, including the opt-in ordering. Independent of 1–3, and reviewed
   alone: it touches the attribution path #1000 verified.

## 6. What the review overturned

The interview first put the code on the Task and derived the target live, with
`socialPostVariant.link` holding the short URL. The code contradicted it twice: the stored link is
parsed for `utm_*` by the regeneration dedupe and the orphaned-publication ledger, and published
variants outlive their Task, so every posted link would have died on a plan reseed. Hence §2.1.

Earlier, the interview had the strip on first paint (it would have unattributed cookieless
visitors) and a confirmation dialog for retargeting a published Task (the edit is already refused).
