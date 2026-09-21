# Short links for tagged marketing links

Decided in a design interview on 2026-09-21. Amends
[`MARKETING_PLAN_SPEC.md`](./MARKETING_PLAN_SPEC.md) §3.4, where the tagged link is the long UTM URL.

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

- **Every link we post becomes `https://<conference domain>/go/<code>`** (§2), which redirects to
  the long URL. Attribution is untouched: the visitor still lands on a URL carrying the four
  `utm_*` parameters that PostHog, the ledger and the CFP first-touch stash read.
- **The landing page removes `utm_*` from the address bar** once they have been captured (§3).

Not in this work, each a decision and not an omission:

- **Click counting on the redirect.** It would see visitors who never consent, which is its appeal
  and its cost: a store that is not Sanity (250k requests a month rules out a write per click), a
  preview-crawler filter, a `/privacy` change, and an uncacheable redirect, where §2.5 depends on
  a cacheable one. Nothing here blocks adding it.
- **Vanity links** (`/go/cfp` on a slide or a sticker). A different object: not per Channel, not
  tied to a Task, outlives a Campaign. `/go/` leaves room — a vanity word can share the path as
  long as it can never match the code shape in §2.2.
- **A third-party shortener.** A foreign domain costs trust, needs an account per organization, and
  puts click data in a second place.
- **An in-app way to retarget a published link** (§2.6).

## 2. The short link

### 2.1 The code lives on the Task; the target stays derived

`marketingTask` gains `shortCode` (string, read-only in Studio). Nothing else is stored. `/go/<code>`
finds the Task, calls the existing `taggedUrl()` with the Task's `targetPage`, `channel` (or
`outreach`), `campaign.key` and `key`, and redirects there. §3.4's rule becomes: **the target is
derived, only the code is stored.** There is one builder and no second copy of the destination to
drift.

One Task is one link. A publishing Task's key already carries its Channel, and an outreach Task has
exactly one subject and one destination, so no Task needs two codes.

### 2.2 The code

Six characters from `abcdefghjkmnpqrstuvwxyz23456789` — lowercase, without `0 o 1 l i`. Random,
unique within the conference, never changed once minted, not editable anywhere. About 887 million
codes per conference.

Minted when a Task is created — in `materializeTask`, the one function that seeding, expansion,
copy-to-new-edition and the add-task mutation all build Tasks through, so a copied Task gets a NEW
code, never the source's — and lazily wherever a link is built for a Task that has none. Minting checks the code is free in the
conference and retries on a hit.

**Known hole.** Sanity has no unique constraint, so two concurrent mints could pick the same code.
The redirect would then follow whichever Task the query returns first. At these odds it is accepted
rather than engineered around; the fix, if ever needed, is a deterministic-`_id` claim document.

### 2.3 What carries the short link

Everything. `socialPostVariant.link` holds the short URL, so the Bluesky embed `uri`, a `{url}` in
body copy, the LinkedIn body or first comment, the copy-ready view and the outreach `{url}` all get
it without knowing. The base is the same `conferenceBaseUrl()` primary domain as today.

One consumer needs the long URL: the Bluesky link-card scraper
(`src/lib/social/provider/link-card.ts`) reads Open Graph tags from the destination page. The
publisher holds the Task, so it derives the long URL for scraping and posts the short one. The
scraper does not learn to follow `/go/`.

A link in the body now costs a fixed `origin + /go/ + 6` characters. The LinkedIn manual-copy length
check (`ManualPostView.tsx`) counts the short link.

`sitePathIssue` refuses a `targetPage` under `/go/`, so a link can never point at a link.

### 2.4 The route

`GET /go/<code>`, answered on every domain of the conference.

| Request                                                                  | Response                                 |
| ------------------------------------------------------------------------ | ---------------------------------------- |
| Code does not match `^[a-hjkmnp-z2-9]{6}$` after lowercasing             | 404. Sanity is not touched.              |
| Well-formed, a Task in THIS conference has it, and its target derives    | 302 to `taggedUrl()`                     |
| Well-formed, no Task in this conference has it                           | 302 to the conference home page, no UTMs |
| Well-formed, Task found, `taggedUrl()` throws (hand-edited `targetPage`) | 302 to the conference home page, no UTMs |

The code is lowercased before the shape check: some clients capitalise a pasted link. A code that
belongs to another conference is simply unknown here — the lookup is scoped by the conference the
host resolves to, so the two cases are indistinguishable from outside.

302, never 301 or 308: a permanent redirect is pinned by browsers and would survive a repaired
`targetPage` (§2.6). `Cache-Control: no-store`, `X-Robots-Tag: noindex`.

A person who clicked a real post always reaches the conference. A scanner costs nothing. A removed
destination page is the site's own 404 — the redirect does not second-guess `targetPage`.

### 2.5 Caching

Every click would otherwise be a Sanity read. The lookup
`(conferenceId, code) → { channel, campaignKey, taskKey, targetPage } | null` follows the repo's
wrapper pattern: the route reads the host and resolves the conference, the inner function is
`'use cache'` with `cacheTag('marketing-link:<taskId>')` and a one-day `cacheLife`. Task delete and
any in-app write to `targetPage` call `revalidateTag`. A miss is cached too, on a short life, so a
dead code in a popular post cannot drain the quota.

Steady state is one read per code per day, whatever the click count. A Studio edit is seen within a
day.

**Acceptance is the request log, not a unit test.** `'use cache'` has been found silently
ineffective on this project before. Slice 1 is done when repeated hits on one code show ONE Sanity
read in the exported request log.

### 2.6 Changing a published link's destination

Cannot happen in the app, and this work keeps it that way. A publishing Task's `targetPage` is
written only through `social.updateVariant`, which refuses a variant outside `EDITABLE_STATUSES`;
an outreach Task's only while it is open and unsent (`task.update`). So no confirmation dialog is
needed: the edit it would guard is already refused.

The redirect still follows the Task live, which is what makes the emergency repair work: edit
`targetPage` in Studio and every published post follows within a day (§2.5).

Follow-up, to build the first time it is actually needed: a narrow `task.retarget` mutation,
available only for a published or sent Task, that validates through `taggedUrl()`, confirms with
the count of posts it will move, patches `targetPage` and revalidates the tag.

### 2.7 The Task editor

Shows the short link and, under it, the destination it expands to, so nobody has to click through
to see where a link goes. Deleting a Task whose variant is `published`, or whose outreach is sent,
warns that its posted link will fall back to the home page. It warns; it does not block.

## 3. The address bar

After the redirect the visitor is on the long URL. Three readers need it first:

- **PostHog, cookieless.** A visitor who never consents is attributed through the server
  session's entry UTMs, which come from the SDK's own first `$pageview` reading the address bar
  (`src/lib/posthog/config.ts`, #1000). **Stripping before that pageview would unattribute every
  non-consenting visitor.**
- **PostHog, on Accept.** Already safe: `initTenantAnalytics` holds the landing UTMs in memory from
  before init and replays them.
- **CFP first touch.** `landing-utm.ts` stashes to `sessionStorage` on landing.

So, in order: the CFP stash is written; the SDK's first `$pageview` is captured; then
`history.replaceState` to the same URL without the five `utm_*` parameters, every other parameter
and the hash kept. Where analytics is not configured or the route is analytics-excluded, there is
no pageview to wait for and the strip is immediate. A ~3 s timeout strips anyway when the SDK is
blocked or slow: those visitors were never going to be attributed.

This applies to every landing with `utm_*`, not only arrivals through `/go/`.

**Acceptance is a real browser, not a mocked SDK.** A cookieless visit through a `/go/` link must
still produce `$entry_utm_campaign` and `$entry_utm_content` in PostHog, and an accepting visit
must still carry the replayed properties, with the address bar clean in both.

## 4. Existing data

Production has no `marketingTask` and no `socialPostVariant` documents (queried 2026-09-21; drafts
are invisible to that query). No migration. Lazy minting (§2.2) covers any Task that predates the
field.

## 5. Slices

1. **Short links** — `shortCode` and minting, `/go/<code>` with §2.4 and §2.5, the link swap (§2.3),
   the editor (§2.7). Lands before or with the first-comment slice
   ([#1134](https://github.com/CloudNativeBergen/website/issues/1134)), which reads `variant.link`
   whatever its shape.
2. **Clean address bar** — §3. Independent of slice 1, and reviewed alone: it touches the
   attribution path #1000 verified.
