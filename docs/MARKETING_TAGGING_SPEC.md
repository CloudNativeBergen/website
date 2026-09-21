# Tagging speakers and sponsors in marketing posts

Decided in a design interview on 2026-09-22 and checked against the code before writing (§8). Amends
[`MARKETING_PLAN_SPEC.md`](./MARKETING_PLAN_SPEC.md) §5.2 (recipes and placeholders) and
[`LINKEDIN_VIA_BUFFER_SPEC.md`](./LINKEDIN_VIA_BUFFER_SPEC.md) §1, which lists @-mentions as not in
that work.

## 1. What changes

A post about a speaker or a sponsor names them in plain text. A **tag** — a real mention — lands in
that account's notifications and invites a reshare, which is the whole point of a speaker card.

- **Bluesky:** real tags, generated into the copy, for speakers and sponsors we hold a handle for.
- **LinkedIn:** plain names, and a "tag by hand" list for the organizer. LinkedIn does not let us
  do more (§5).
- **Speakers can say no** (§3.2), and that is honoured up to the moment of publishing (§4.4).

Not in this work: tagging on any other Channel; real LinkedIn tags (a spike decides whether sponsor
tags are ever possible, §5.2); tagging anyone who is not a subject of the Task; a sponsor
self-service form for handles.

## 2. Who decides that a post tags

Both the template and the organizer.

- A recipe gains **`tagSubject`** (boolean). Generated copy for a `tagSubject` recipe tags its
  subject. It is ON for the five built-in recipes that are about a person or a company — sponsor
  announcement, keynote card, speaker card, talk teaser, talk recording — and OFF by default for a
  new recipe in an organization's own template, where the recipe form exposes it.
- The Task editor has a **tag button** beside each subject's name on a Bluesky post, whatever the
  recipe says. It swaps the name for the handle and back. An organizer can also just type a handle.

Adding the boolean touches every layer a recipe passes through — the recipe type, the stored Recipe
on the Campaign and its projection, the Plan Template recipe member, the strict recipe-edit schema
with its `editsOf`/`applyEdits`, and the recipe form. A missing field is `undefined`, not an error:
the round-trip test over the built-in recipes must assert the VALUE survives.

## 3. Where handles come from

### 3.1 Speakers

From the profile links they already gave us (`speaker.links`, free URLs). The Bluesky handle is the
first link of the form `bsky.app/profile/<handle>`, custom-domain handles included. A profile URL
that carries a `did:` instead of a handle yields no handle. The existing `deriveBlueskyHandle` is
not reused as is: it was written for the conference's own `socialLinks` and returns a bare
`did:plc:…` for such a URL. The LinkedIn profile is the first
`linkedin.com/in/…` link, query string dropped.

Production today: 396 speakers, 28 with a Bluesky link, 139 with a LinkedIn profile link.

### 3.2 The opt-out

The speaker profile form gains **"Don't tag me in social posts"**, stored as a boolean with the
time it was set. It is not a consent grant and does not live in `speaker.consent`. Off by default:
speakers gave us these links for their public profile and promotional material, and a tag is a
stronger use of them, so the form copy and `/privacy` say that we may tag the accounts a speaker
lists and how to stop it.

It covers Bluesky tags and the LinkedIn hint list alike.

The speaker input schema strips keys it does not know, so a new field sent by the form is dropped
silently unless the schema names it; the timestamp is stamped on the server, never taken from the
client. The admin speaker update reaches the same writer: **an organizer may SET the opt-out on a
speaker's behalf, and only the speaker can clear it.** (Not put to the organizer in the interview;
the author's call.) **It ships in the same release as the
first tag** — there is never a version that tags people who cannot say no.

### 3.3 Sponsors

On the sponsor company, entered by the organizer in the sponsor CRM, reused across editions: a new
**Bluesky handle**, checked against Bluesky on save, and the LinkedIn company page. The sponsor
input schema and projections already carry a `linkedinUrl`; reuse it, and make sure the Studio
schema declares it. No opt-out: these are an organizer's own entries about a commercial partner.

## 4. Bluesky

### 4.1 Copy

One value map serves both Channels of a beat AND the image alt text, so **`{name}` stays a plain
name in that map.** The tag is applied in one place only: when the BODY of a Bluesky `tagSubject`
recipe is resolved, `{name}` and `{speakers}` resolve with handles. Alt text, LinkedIn copy, the
rendered image card and outreach never see a handle.

A handle costs its full length against the 300-grapheme limit. If the resolved body would not fit,
names fall back to plain text starting from the last speaker, until it fits.

The conference's own account is never tagged.

### 4.2 Talks with several speakers

A talk subject today is its first speaker only. It becomes all of the talk's speakers, in the
order the talk lists them:

- `{name}` — the names joined: "Alice", "Alice and Bob", "Alice, Bob and Carol". In a tagging
  Bluesky body each name is a tag where we hold a handle and the speaker has not opted out, a plain
  name otherwise: "@alice.dev and Bob Smith". Nobody is left out of their own talk's post.
- `{speakers}` — new: each with what `{company}` holds for a speaker today, which is their job
  title: "Alice (SRE, Acme) and Bob (CTO, Initech)". The built-in
  talk skeletons that write `{name} ({company})` switch to `{speakers}`.
- `{company}` on a talk stays the first speaker's, as today. It is only meaningful for a
  single-speaker talk; `{speakers}` is the placeholder to use.

### 4.3 What the variant records

`socialPostVariant` gains **`mentions[]`**, one entry per tag: the handle, the DID it resolved to,
the speaker or sponsor it refers to, the plain name it stands for, and a status — `tagged`, or
`unresolved` when generation wanted to tag and the handle did not resolve, which is what the editor's
note ("Alice's Bluesky link does not resolve") is shown from. Array items carry `_key`.

The entry refers to the PERSON, not to the Task's subject: a talk Task's subject is the talk
document, so the Task editor loads the talk's speakers — with their links and opt-out — to have
names to put a tag button beside.

**`mentions[]` is rebuilt on every save of the body**, not only by generation and the button: each
`@handle` in a Bluesky body is matched against the handles of this conference's speakers and
sponsors, and a match is recorded. Otherwise a handle typed by hand — or a generated one deleted and
retyped — would be a tag that no check knows about, and an opted-out speaker could be tagged by
typing. A typed handle that matches nobody we know (`@kubernetes.io`) is just the organizer's text.

### 4.4 The checks

| When       | What is checked                                                                         | Outcome                                                                                           |
| ---------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Generation | The handle resolves on Bluesky                                                          | If not: plain name, and an `unresolved` entry for the editor's note                               |
| Save       | No recorded mention is of an opted-out speaker; the body fits in BOTH forms (below)     | If not: the save is refused with an issue                                                         |
| Approval   | Each recorded mention: speaker not opted out, handle still resolves to the recorded DID | If not: refused with an issue, fixed with one click ("use the plain name")                        |
| Publish    | Each recorded mention: speaker not opted out                                            | The tag is swapped for the plain name, the post goes out on schedule, the organizers are notified |

**Both forms must fit.** A name can be longer than its handle, so a publish-time swap could push a
post past 300 graphemes and fail it instead of sending it. From save onward a tagging body is
validated twice: as written, and with every tag replaced by its name. Generation never validates
length today, so the fallback in §4.1 is new logic, and it needs the speakers as a structured list
— the placeholder values are a flat string map.

**Approval** is refused on three paths, not one: approving the Task, scheduling the variant, and
saving a variant that is already scheduled. Issues reach the client as one joined string today and
carry only a field and a message; the one-click fix needs a structured issue — a code and the
mention's key. The resolve is a network call in a check that is otherwise local: **Bluesky being
unreachable is a warning; only a definite "no such handle" or a changed DID refuses.** Resolution
uses the public, unauthenticated endpoint the engagement reader already calls, so an organization
with no Bluesky connection is checked the same way.

**Generation** also runs inside event-bus handlers for Triggers. The resolve has a short timeout
and can never fail or delay the mutation that raised the event; a timeout is treated as unresolved.
A generated Task is never regenerated, so an unresolved tag stays a plain name until someone
presses the tag button — which is why the button ships in the first slice.

**Publish.** The engine's work query is one read per tick by design, and an extra query per tick is
tens of thousands of requests a month: the speakers' opt-out is folded into that projection through
the recorded mentions, not fetched separately. The engine hands the adapter the recorded DIDs, and
**the adapter builds those mention facets from them** rather than resolving the handle a second
time — two resolutions could disagree, and the one that was checked is the one that must be
posted. Handles that are not recorded still go through `detectFacets` as today.

The swap is the one case where what goes out differs from what was approved, and the record must
not lie about it: **the variant's `body` is rewritten to the text actually posted**, in the same
transition that marks it published. The store's transition carries no body today; it gains one.
Known hole: a settle that loses its revision race loses the rewrite with it, and the stored body
then still shows the tag that was not posted. The notification is a new type beside
`marketing_task_failed`, linking to the Task, under the never-fail contract.

A Bluesky variant in an organization with no Bluesky connection never reaches the engine's check:
it goes `awaiting-manual` and the organizer pastes the body by hand, perhaps days later. The manual
post view runs the approval check when it opens and shows the body that passes it.

The adapter's mention path has never been tested: the fixture PDS refuses every `resolveHandle` and
no test text contains an `@`. The first slice makes the fixture resolve handles and asserts the
mention facet's DID and byte range.

## 5. LinkedIn

### 5.1 Hints, not tags

On LinkedIn a tag is not text. It is an annotation carrying the entity's URN and character offsets.
For a person we cannot get the URN: LinkedIn's lookup is granted to select developers only, returns
only followers of the company, and a Page can only tag profiles that follow it. So:

- LinkedIn copy always uses plain names.
- The manual post view lists **"Tag by hand"**: each subject's name beside their LinkedIn profile or
  company page, opted-out speakers left out. The organizer types `@` and the name in LinkedIn's own
  composer and picks the entry — pasting `@Name` does not create a tag.
- A post published through Buffer goes out untagged.

### 5.2 Spike: sponsor tags through Buffer

Buffer's API does carry LinkedIn annotations (`metadata.linkedin.annotations`: entity URN, id,
offsets, names), but offers no lookup, and nobody has seen the field work. The spike publishes one
real post tagging one company and answers: does the tag render; what happens when the Page does not
follow us; and is there a way to get a company's numeric id an organizer could actually use, short
of the dormant LinkedIn application (#998). Real sponsor tags are specified after it, or not at all.

## 6. Privacy

`/privacy` changes with the opt-out slice: what we do (tag the accounts a speaker lists, in posts
about them and their talk), the basis (the links given for the public profile and promotion), and
how to stop it (the profile checkbox, effective for every post not yet published).

## 7. Slices

1. **Bluesky speaker tags** — handle parsing (§3.1), `tagSubject` on the built-in recipes (§2),
   body-only resolution (§4.1), `mentions[]` (§4.3), all the checks (§4.4), the editor's tag button
   (it is also the one-click fix), real mention-facet tests.
2. **The opt-out** — §3.2, §6. Merges WITH slice 1, never after it.
3. **All speakers of a talk** — §4.2.
4. **Sponsor handles and sponsor tags on Bluesky** — §3.3.
5. **LinkedIn "tag by hand" hints** — §5.1.
6. **The recipe switch** in the template recipe form — §2.
7. **Spike** — §5.2.

## 8. What the code changed before this was written

- The interview had `{name}` itself become the handle. One value map feeds both Channels and the
  alt text, so that would have put `@alice.dev` into LinkedIn copy and into image descriptions.
  Hence body-only resolution (§4.1).
- Naming every speaker makes `{name} ({company})` incoherent — `{company}` is one speaker's
  affiliation. Hence `{speakers}` (§4.2). **This placeholder was not put to the organizer in the
  interview; it is the author's call and open to veto.**
- The publish engine cannot persist a changed body today. Hence the transition change (§4.4).
- Nothing on a variant records a mention, so "has this speaker opted out since?" had nothing to
  check against. Hence `mentions[]` (§4.3).
- `deriveBlueskyHandle` accepts `did:` profile URLs (§3.1).
- Sponsors already have a `linkedinUrl` in the input schema (§3.3).
- A review round added: both-forms length validation, rebuilding `mentions[]` on save so a typed
  handle cannot dodge the opt-out, DIDs passed to the adapter, the opt-out folded into the engine's
  single read, the manual path for an unconnected organization, structured issues on three refusal
  paths, and the tag button moving into the first slice.
