# Content Judgement

Status: **ready for implementation**. This spec is where the wayfinder map
[Judging user content with Jev](https://github.com/CloudNativeBergen/website/issues/1564)
ends up. Every decision below was made on a closed map ticket or by the user
while this spec was written (§3). The spec gathers them and links to the
ticket that holds each one's reasoning; to change a decision, reopen its
ticket.

Two kinds of statement aren't map decisions, and each is marked where it
appears:

- **Refinement (spec):** a rule the decisions left open, settled here because
  an implementer can't build without it. None changes what a decision says.
- **Implementation detail:** an engineering choice that changes nothing an
  organizer, speaker or attendee can observe. Named helpers, field names,
  procedure names, document ids and file locations are implementation details
  unless marked otherwise; an implementer may pick better ones.

## 1. What this delivers

An organization can turn on **content judgement**. From then on, TypeSafe's
**Jev** classifier reads three kinds of user-written content in the background
and gives organizers a **Judgement** on each:

- **Wall Posts** on the Photo Wall: the caption and the photo, judged in one
  call, each with its own Judgement.
- **Comments on Feedback Responses** in Session Feedback.
- **Conversations** in speaker↔organizer messaging: the opening gets a
  **Message Category** that organizers filter and sort the inbox by.

v1 **advises**. A Judgement is shown to organizers and changes nothing on its
own. Organizers' decisions on flagged content are counted in an anonymous,
platform-wide **agreement tally**. **Enforcement** (hiding a flagged comment
from the speaker until an organizer decides, holding a flagged Wall Post in
Not shown) can be switched on per surface only for questions that have passed
two gates: a held-out offline eval and the shadow-mode agreement bar (§10).

### Out of scope

- **Routing by Message Category** to organizer teams, **per-organization
  category lists**, **sponsor Message Categories**, and **re-judging a
  Conversation whose topic drifts**. Each waits on evidence that v1 categories
  are useful; none is in this spec.
- **Judging any message other than a Conversation's opening.**
- **Speakers or attendees seeing Jev's verdict.** Judgements are for
  organizers only.
- **Enforcement for Message Categories.** A category is already applied in v1
  and an organizer's change always wins (#1572).
- **Plan gating.** Content judgement is available on every plan in v1 (§5).

## 2. Vocabulary

These terms land in `CONTEXT.md` with this spec.

- **Judgement**: Jev's typed answer about one piece of user-written content
  (a Wall Post's caption, a Wall Post's photo, a comment on a Feedback
  Response, or a Conversation's opening). Advice to an organizer unless
  enforcement is on for that surface and question.
- **Message Category**: the topic of a Conversation, from one fixed
  platform-wide list. Jev sets it once when the Conversation opens; an
  organizer's change always wins.
- **Likely unsafe**: a moderation Judgement with any answer at or above 0.5.
- **Not judged**: content that should have a Judgement but doesn't (Jev off,
  slow, failing, over the spend cap, or the photo didn't arrive). It stays on
  today's human path.
- **Shadow mode**: Judgements shown as advice while organizers' decisions on
  flagged content are tallied, before enforcement.
- **Enforcement**: a Judgement acting without an organizer, per surface and
  only for questions that passed both gates.
- **Agreement**: an organizer's decision on flagged content that matches the
  flag (Hide, Remove or Reject), or a Message Category left unchanged until the
  Conversation is resolved.

Existing terms kept: **Wall Post** (not "upload"), **Feedback Response** (a
Feedback Colour and an optional comment), **Conversation**.

## 3. Decision index

| Topic                                                                                                        | Decided in                                                                               |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Advise first, enforce when proven; three surfaces; opt-in per organization; judge after the write, fail open | Charting, on the map ([#1564](https://github.com/CloudNativeBergen/website/issues/1564)) |
| Jev API shape, pricing, versioning, Norwegian unknown, image support                                         | [#1566](https://github.com/CloudNativeBergen/website/issues/1566)                        |
| TypeSafe data terms (DPA, no training, Telemetry licence)                                                    | [#1565](https://github.com/CloudNativeBergen/website/issues/1565)                        |
| Route: OpenRouter, `typesafe/jev-1.14`, zero retention, one platform account                                 | [#1574](https://github.com/CloudNativeBergen/website/issues/1574)                        |
| The seven Message Categories                                                                                 | [#1567](https://github.com/CloudNativeBergen/website/issues/1567)                        |
| Judgement record, summary, tally, erasure, system openings, re-judging                                       | [#1568](https://github.com/CloudNativeBergen/website/issues/1568)                        |
| Questions, development eval set, advice and category bars, enforcement bar                                   | [#1569](https://github.com/CloudNativeBergen/website/issues/1569)                        |
| Jev judges photos; one call per Wall Post; image guard                                                       | [#1570](https://github.com/CloudNativeBergen/website/issues/1570)                        |
| How Judgements look in the queues and the inbox                                                              | [#1571](https://github.com/CloudNativeBergen/website/issues/1571)                        |
| Agreement, shadow bar, the enforcement switch, enforcement actions, held-out sets                            | [#1572](https://github.com/CloudNativeBergen/website/issues/1572)                        |
| Public photo eval; photo questions ignore the caption                                                        | [#1576](https://github.com/CloudNativeBergen/website/issues/1576)                        |
| No plan gating; platform pays; spend cap                                                                     | This spec, by the user (2026-10-25)                                                      |

## 4. Provider and call

### 4.1 Route

- **OpenRouter**, `POST https://openrouter.ai/api/alpha/decisions`, body
  `{ model, questions, state }`, with `provider: { zdr: true }` on every
  request and zero data retention also enforced on the account (#1574).
- **Model** `typesafe/jev-1.14`. The response's `model` names the dated build
  that answered (today `typesafe/jev-1.14-20261014`); every Judgement stores it.
- **One platform-owned OpenRouter account.** Organizations never bring keys.
  The key is a platform secret, `OPENROUTER_API_KEY`, read only on the server.
  **Implementation detail:** declared in `fnox.toml` for local runs, set in
  Vercel for deployments, read with an assert in a new server-only module
  (`src/lib/content-judgement/client.ts`).
- **Spend cap.** A monthly credit limit is set on the OpenRouter key (a user
  step, §14). A refused call (402) leaves the content not judged.
- **Timeouts and retries.** **Refinement (spec):** each call has a 20-second
  timeout and up to three attempts on 429/5xx with backoff, all inside one
  background task; then the content is not judged. There is no later retry in
  v1.

### 4.2 Questions

The production questions and the offline eval are **the same module**, so the
eval measures exactly what production sends. **Implementation detail:** move
`evals/content-judgement/questions.ts` to
`src/lib/content-judgement/questions.ts` and import it from the eval runner.

| Surface                    | Questions                                                                                                             | Set |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | --- |
| Comment                    | four `noul`: `abusive`, `sexual`, `spam`, `personal_info` (comment wording: harsh criticism of the talk is not abuse) | v2  |
| Wall Post, caption present | the four caption questions (`caption_*`) and four photo questions (`photo_*`)                                         | v4  |
| Wall Post, no caption      | the four photo questions                                                                                              | v4  |
| Conversation opening       | one `choice`, `category`, over the seven Message Categories (§8.3), from the subject and the opening message          | v2  |

- **Photo questions judge only what is visible and ignore the caption** (#1576).
  Their meanings: sexual = nudity or sexual content; abusive = harassment, hate
  symbols, gore; spam = ads, QR-code lures, unrelated promotion (a conference
  sponsor's booth, banner or swag is not spam); personal_info = a readable
  badge with a full name, an ID card, a screen or paper with private emails,
  phone numbers or addresses.
- **Abusive includes sexual remarks or propositions aimed at a person**
  (#1569).
- The question set version and the model build are part of every Judgement.
  **Every bar in §11 must be met again whenever either changes.**

### 4.3 The Wall Post call

- **One call per Wall Post**: `state` is an array with a text part holding the
  caption (when there is one) and an
  `{ "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,…" } }`
  part. TypeSafe's direct-API `assets` map must not be used: OpenRouter drops it
  silently and Jev still answers (#1570).
- **The whole photo is judged**, not the square crop on screen.
- **Size.** The photo is sent at most 1568 px on its longest side and at least
  280 px on its shortest (Jev's limits; it never resizes). **Implementation
  detail:** fetch the stored asset through Sanity's image pipeline with
  `w=1568&h=1568&fit=max&fm=jpg`; the composer already strips EXIF and stores
  at most 2048 px.
- **Image guard.** OpenRouter ignores unknown fields without an error, so a
  response counts only if its `usage.input_tokens` shows the image arrived:
  at least the text-only baseline for that request shape **plus 500**. The
  baselines for question set v4 are **1,568 tokens with a caption and 772
  without** (measured by the eval runner's calibration calls, #1576). Below the
  floor, the Wall Post is not judged. **Refinement (spec):** the baselines are
  constants next to the questions and are re-measured with the eval runner
  whenever the question set changes.
- **Cost.** About $0.00024 per Wall Post call and $0.00004 per text call. A
  conference with a few hundred comments and Wall Posts costs roughly
  $0.10–0.20.

## 5. Opt-in and settings

- **Per organization, off by default** (charting). When it is off, no content
  is sent anywhere, nothing is shown, and OpenRouter is not listed as a
  subprocessor (§13).
- **Who switches it:** an organizer, on `/admin/settings`, in a new **Content
  judgement** card with one switch (**Judge content**) and, per surface, an
  **Enforce** switch (§10).
- **Not plan-gated**, and the platform pays for the account (this spec, by the
  user). Content judgement is therefore not a `FEATURE_IDS` entry: the feature
  registry is turned on by plan or by platform operators, while this switch
  belongs to organizers.
- **Implementation detail:** fields on the `organization` document:
  `contentJudgement { enabled: boolean, enforceFeedbackComments: boolean,
enforceWallPosts: boolean, changedAt, changedBy }`. The `organization`
  schema is **append-only** (`AGENTS.md`): add fields only. If the schema
  contract test flags the new fields, regenerate
  `sanity/schema-shape.baseline.json` in the same PR.
- **Refinement (spec):** content written while the setting was off is never
  judged retroactively. Turning the setting off stops new calls at once; stored
  Judgements stay until their content is deleted (§12) and are hidden from the
  admin views while the setting is off.

## 6. When content is judged

**Judge after the write, in the background.** A slow or failing Jev never
delays or fails a submit (the same never-fail rule as notifications). Every
judging task runs through `runAfterResponse`, catches its own errors, and
writes either a Judgement or a not-judged summary.

| Surface      | Trigger                                                                            | Notes                                                                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comment      | `submitFeedback()` stores a new or changed non-empty comment                       | A colour-only tap doesn't trigger. **A changed comment is judged again and the new Judgement replaces the old one** (#1568), which also clears any Keep mark (§8.2). An emptied comment deletes its Judgement. |
| Wall Post    | `submitWallPost()` creates the post                                                | Wall Posts can't be edited.                                                                                                                                                                                    |
| Conversation | the first message of a `proposal` or `general` Conversation is written by a person | Sponsor Conversations are never judged. **System-generated openings are never judged** (#1568); they take their category from the event that created them (§8.3).                                              |

**System-generated openings need a marker.** Today the withdrawal and removal
relays (`proposal.ts`), the "no longer a speaker" notice and marketing outreach
(`marketing.ts`) are ordinary messages authored by the acting organizer, so
nothing distinguishes them. **Implementation detail:** add `origin: 'person' |
'system'` to `message`, set to `system` at those call sites (absent means
person), and pass the event's category alongside.

## 7. Data model

### 7.1 The Judgement record

**Its own record, plus a summary on the content** (#1568). **Implementation
detail:** a Sanity type `contentJudgement`, one document per judged piece of
content, with a deterministic id so the latest Judgement replaces the previous
one:

| Field         | Meaning                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conference`  | Scope, like every tenant document.                                                                                                                                                             |
| `surface`     | `wallPost`, `feedbackComment` or `conversation`.                                                                                                                                               |
| `content`     | **Weak** reference to the `wallPost`, `feedbackResponse` or `conversation`.                                                                                                                    |
| `parts`       | One entry per Judgement: `caption` and `photo` for a Wall Post, `comment`, or `opening`. Each holds the answers (probability per `noul`; choice, probabilities and confidence for `category`). |
| `model`       | The returned build, e.g. `typesafe/jev-1.14-20261014`.                                                                                                                                         |
| `questionSet` | e.g. `v2`, `v4`.                                                                                                                                                                               |
| `contentHash` | SHA-256 of exactly what was sent (text and image bytes): shows whether the content changed since.                                                                                              |
| `inputTokens` | From `usage`, for the image guard and cost.                                                                                                                                                    |
| `judgedAt`    | Time.                                                                                                                                                                                          |

- **No copy of the judged text or image** is ever stored, only the hash.
- **Only the latest Judgement per content is kept.**

### 7.2 The summary on the content

So the queues and the inbox render without joins.
**Implementation detail:** `judgement` on `wallPost` and `feedbackResponse`:

| Field          | Meaning                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `state`        | `judged` or `notJudged`. Absent means not yet judged (or the setting was off when it was written).                |
| `reasons`      | For `judged`: every question at or above 0.5, as `{ part, question, probability }`, strongest first.              |
| `notJudgedWhy` | `failed`, `spendCap`, `imageMissing` (for Wall Posts, per part: the caption can be judged while the photo isn't). |
| `judgedAt`     | Time.                                                                                                             |

**Message Category on the Conversation.** **Implementation detail:**
`messageCategory { value, source: 'jev' | 'organizer' | 'system', confidence,
setAt, setBy }` on `conversation`. Jev writes it once; **an organizer's change
always wins and is never overwritten**.

**Keep is recorded** on `feedbackResponse` (#1571): `keptAt`, `keptBy`.
Today `adminKeep` only unsets `flaggedAt` and stores nothing, so Jev's advice
would come straight back.

### 7.3 The agreement tally

An **anonymous, platform-wide** count (#1568), written **at the moment an
organizer acts**. It references no content, organization or conference, holds
no personal data, and survives every deletion. **Implementation detail:** one
document per `surface × model build × question set × question × score band`,
with `agreed` and `disagreed` counters, incremented with `inc` in the same
transaction as the organizer's action. It is deliberately outside tenancy:
annotate its queries for `tenancy/no-unscoped-groq` and explain why.

- **Score bands:** `[0.5, 0.9)` and `[0.9, 1]` for moderation questions;
  confidence `< 0.7` and `≥ 0.7` for categories.
- **What counts** (#1572): only content Jev flagged. Hide, Remove or Reject is
  agreed; Keep or Approve is disagreed, including Keep or Approve on enforced
  content. Inaction counts as nothing, and misses aren't measured. A Message
  Category counts when the Conversation is resolved: unchanged is agreed,
  changed by an organizer is disagreed. **Refinement (spec):** a Conversation
  is tallied once, at its first resolve; a flagged comment or Wall Post is
  tallied once, at its first decision.
- **The bias is accepted:** organizers see the advice before deciding, so
  agreement is biased upwards; the bar is stricter to make up for it (#1572).

## 8. Advice in organizer tools

Every surface shows **percentages** (the user's call, #1571). Nothing shows
when the organization has content judgement off. The prototypes are on the
throwaway branch `prototype/content-judgement-ui`
(`src/components/*/*.prototype.*`); build from them, not into them.

### 8.1 Photo Wall moderation queue: covered photos

- A Wall Post whose photo is likely unsafe shows its photo **blurred behind
  its reason and score** ("May show nudity (78%)") until the organizer taps
  **Show photo**; **Hide** covers it again. A post someone already decided on
  is never covered.
- **Which part raised it** is always shown: caption, photo or both. Caption
  reasons: phone numbers and emails are highlighted inline; other reasons mark
  the whole caption with a reason chip (Jev returns no text positions).
- **Not judged**: "Photo not judged" as a pill on the photo when only the
  photo failed; "Not judged" in the meta row when the whole post did.
- The Pending queue keeps its **oldest-first order**; Judgements don't sort it.
- **"Approve all" skips likely-unsafe posts**: "Approve 4 · 6 to check first".
  Flagged posts stay Pending until decided one by one; not-judged posts are
  included as today.
- **Implementation detail:** `WallPostCard` has no slot today (photo, caption,
  meta, actions are fixed) and `ModerationPost` has no judgement field.

### 8.2 Session Feedback admin: triage strip

- Three count tiles above a talk's comments, each a filter: **Flagged by
  speaker**, **Likely unsafe**, **Not checked**. Speaker flags and Jev's advice
  are counted apart, so Jev's mistakes never read as complaints.
- Any flagged comment shows its reason line and **Show comment** instead of its
  text. Harsh-but-fair criticism stays unmarked.
- **Keep** records who kept it and when: "Kept by Kari · was: may contain
  personal details (61%)". The advice stops, the comment leaves the Likely
  unsafe count, and the tally counts one disagreement. Re-judging (an edited
  comment) clears the mark.
- `personal_info` is one probability, so copy says "personal details", never
  "a phone number".
- **Refinement (spec):** the `/admin/feedback` flagged box and the
  `flaggedCount` nav badge stay speaker-flag only. `CommentItem`'s hard-coded
  "Flagged by a speaker" gains a source.

### 8.3 Organizer inbox: category chip and filter bar

- The seven **Message Categories** (#1567): **Talk details, Proposal status,
  Account and site, Schedule, Travel and visa, Tickets, Other**. Rules for
  ambiguous openings: Talk details when a change is asked for or announced,
  Proposal status only when the decision itself is the topic; the question
  asked wins (a schedule question while booking flights is Schedule).
- Each row's preview line leads with a **category chip**: dashed = Jev's
  guess, "?" = confidence under 0.7 (an **uncertain** guess), solid = set by an
  organizer or the system, a small check = organizer.
- A **filter bar** with counts above the list, and a sort menu: **Newest /
  Unsure first / By category**. Filtering and sorting are **server-side**
  inputs to `listConversations` (the list is a keyset page by `lastMessageAt`,
  so "By category" needs a keyset that includes the sort key).
- **An uncertain guess is not a filter value** (#1569): it appears under
  "All" and sorts first under "Unsure first" until an organizer confirms or
  changes it.
- **Changing a category**: the chip in the thread header opens the menu
  ("Best guess (55%): confirm or change it" for uncertain guesses). Below `lg`
  the chip sits on a line under the subject (the header already holds Resolve,
  Mute and "…"). Confirming or changing sets `source: 'organizer'`.
- **Not judged**: no chip; the Conversation shows only under "All".
- **System-generated openings** take their category from the event: a
  withdrawal, removal or cancellation is **Proposal status**; a language or
  format change is **Talk details** (#1568).
- **Sponsor Conversations** never get a category and appear only under "All".

## 9. Shadow mode

Shadow mode is v1 itself: every Judgement is advice and every organizer
decision on flagged content goes into the tally (§7.3). There is nothing to
switch on.

## 10. Enforcement

### 10.1 What it does

| Surface      | Enforcement                                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comment      | A comment flagged by an enforced question is **hidden from the speaker** until an organizer presses **Keep** (shown) or **Remove**.                                    |
| Wall Post    | A Wall Post flagged by an enforced question moves straight to **Not shown**, marked "held automatically"; an organizer can still approve it. Nothing is auto-approved. |
| Conversation | None.                                                                                                                                                                  |

- **Threshold: 0.9**, fixed platform-wide. Advice stays at 0.5; an answer
  between 0.5 and 0.9 is advice only.
- **Who sees what:** the speaker sees nothing while a comment is held (as with
  an organizer's Hide today); the attendee's My posts shows a held Wall Post
  like any post not shown, with no reason. Organizers see "Hidden
  automatically: may be abusive (88%)" in the Likely unsafe tile and "Held
  automatically: May show nudity (93%)" in Not shown.
- **Comments wait for their Judgement** when enforcement is on: speakers see
  comments live while the feedback window is open, so the speaker's view
  leaves out a comment until it is judged, **for at most 10 minutes** after it
  was written; then it goes through (fail open), marked "Not checked" for
  organizers. Wall Posts wait in Pending anyway.
- **Refinement (spec):** comment enforcement is evaluated when the speaker's
  view is read (the Judgement, the organization's switch and the passed
  questions), so a question that drops below the bar stops hiding comments at
  once. Wall Post enforcement is a status change at judging time; a post
  already moved to Not shown stays there until an organizer acts.

### 10.2 The gates

A question is **enforced** on a surface only if all of these hold:

1. **Held-out bar** (#1569): false-positive rate ≤ 1% on at least 300
   negatives and recall ≥ 80% at 0.9, on a held-out set written by people
   (§11.2), for the current model build and question set.
2. **Shadow bar** (#1572): at least **30 organizer decisions** on content that
   question flagged at **≥ 0.9**, with **at most 1 disagreement**, on the
   current model build and question set. A new build starts again at zero.
3. The organization's **Enforce** switch for that surface is on.

**Implementation detail:** held-out results are committed as numbers in a
gate file next to the questions (question, surface, build, question set,
false-positive rate, recall, negatives, date). The platform computes which
questions pass from that file and the tally.

### 10.3 The switch

- An organizer turns **Enforce** on per surface (§5). It enforces only the
  questions that pass both gates. Until one does, the switch is disabled and
  says why ("Not available yet: 12 of 30 checked decisions for spam").
- A question that passes later joins automatically; one that falls below a
  bar (for example after a new build) stops enforcing at once and is back to
  advice only. The organization can switch it off at any time. The platform
  never switches it on for an organization.

## 11. Evals

### 11.1 Development sets (public, in the repo)

`evals/content-judgement/`: 402 text items (captions, comments, Conversation
openings) and 75 Wall Posts (60 CC0 photos fetched by URL and checked by
SHA-256, 15 generated renders). Model-written or model-picked and
human-approved, so they are **development sets**: an upper bound, never the
evidence that unlocks enforcement.

| Bar           | Rule                                                                                      | Status on the current build                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Advice, text  | Flag at 0.5: recall ≥ 95%, harsh-but-fair false positives ≤ 5%                            | Met (98.7% / 97.6% recall, 0 of 30 harsh-but-fair flagged)                                                                                   |
| Category      | Accuracy ≥ 90%; confidence < 0.7 is uncertain                                             | Met (97.3%)                                                                                                                                  |
| Advice, photo | Recall ≥ 95% per question with ≥ 5 positives; false positives on benign + borderline ≤ 5% | **Not met as written, accepted** (#1576): false positives 2.0%, personal_info 8/8, spam 15/16. photo_sexual and photo_abusive not measurable |

### 11.2 Held-out sets (private, built by people)

They gate enforcement only, so building them blocks nothing in v1.

- **Text** (#1572): written by people, not a model (organizers and community
  volunteers, Norwegian and English), **kept outside the repo, only numbers
  committed**. Per surface: 300 benign items shared by all four questions,
  about a third harsh-but-fair or borderline, plus 50 positives per question.
  **Feedback comments first**; captions later.
- **Images** (#1570): a private nudity/gore set built by a person, kept
  outside the repo, read from a local path, only numbers committed.

## 12. Retention and erasure

- **One daily orphan sweep** deletes Judgements whose content is gone (#1568).
  None of today's deletion paths changes (Delete now, the attendee's delete,
  Remove and bulk Remove, Fold, the 24-month messaging retention, the
  proposal-delete cascade), and future ones are covered too. An orphan lingers
  at most a day and holds only scores, a hash and a time.
  **Implementation detail:** `/api/cron/content-judgement-sweep` in
  `vercel.json` with the `CRON_SECRET` bearer check, like
  `/api/cron/feedback-fold`.
- **The summary and Keep mark live on the content** and go with it.
- **The tally is kept indefinitely**: it holds counts only.
- **Speaker erasure needs nothing**: a Judgement holds no personal text.
- `docs/PRIVACY_OPERATIONS.md` gains the lines in §13.3. Nothing in CI enforces
  erasure coverage, so the sweep's test is the guard.

## 13. Privacy

### 13.1 Subprocessor

**OpenRouter** joins the registry, disclosed **only for organizations that
turned content judgement on**. **Implementation detail:** a new
`SubprocessorId` `openrouter`, a catalogue entry
`{ name: 'OpenRouter', purpose: 'Routes attendee and speaker content to the
TypeSafe Jev classifier for moderation advice and message topics, with zero
data retention', group: 'infrastructure', location: 'United States',
chosenBy: 'organizer' }`, an entry in `DISCLOSURE_ORDER`, and a signal from
the organization's `contentJudgement.enabled` (a failed read discloses it as
possible, never omits it). TypeSafe is named as OpenRouter's model provider in
the `/privacy` copy.

### 13.2 `/privacy` copy

**Refinement (spec):** a `ContentJudgementPrivacy` section in
`src/components/legal/`, rendered only when the organization has content
judgement on (unlike the Photo Wall and Session Feedback sections, which are
unconditional). Proposed copy:

> **Automatic checks on what you write**
>
> The organizers of this conference use an automatic classifier to help them
> moderate. It reads photo-wall posts (the photo and its caption), comments
> on session feedback, and the first message of a conversation with the
> organizers, and gives the organizers advice: whether the content may be
> abusive, sexual, spam or contain personal details, and which topic a
> message is about.
>
> The content is sent through OpenRouter to TypeSafe's Jev classifier in the
> United States, under the EU Standard Contractual Clauses, with zero data
> retention: neither keeps it after answering, and it is not used to train
> models. We store only the scores, a fingerprint of what was checked and the
> time, never a copy of your text or photo, and we delete them within a day
> after the content itself is deleted.
>
> The advice is shown to organizers only. A person always decides; the
> organizers may have chosen to hide a comment or hold a photo automatically
> until one of them has looked at it. The legal basis is the organizers'
> legitimate interest in keeping the conference's spaces safe.

### 13.3 `docs/PRIVACY_OPERATIONS.md`

- §2: a new inventory entry **H) Content judgement**: Data: scores per
  question, the returned model build, a SHA-256 of the checked content, time,
  the Keep mark (organizer, time) and the Message Category; Purposes:
  moderation advice and inbox topics for organizers; Legal bases: legitimate
  interest; Retention: until the content is deleted, plus at most one day.
  Plus the **agreement tally**: anonymous counts, no personal data, kept
  indefinitely.
- §4: `- Content judgements: with their content; orphans deleted daily by
/api/cron/content-judgement-sweep` and `- Agreement tally: indefinitely
(counts only)`.
- §6: OpenRouter (model provider TypeSafe, US, SCCs, zero retention), listed
  for opted-in organizations.

## 14. Slices

Every slice is filed as an issue labelled `content-judgement`, under the
parent implementation issue, with the dependencies below as native blocking
edges. Every UI slice ships its Storybook stories and is visually checked with
`pnpm shoot` at phone width and desktop, light and dark, with the story
file's dark-mode mechanism checked, per `AGENTS.md`. Every new tRPC endpoint is
mocked in the affected UI tests and the mutation-surface snapshots are updated.
**No organization turns content judgement on in production before J2 (the
sweep) is deployed.**

| #   | Slice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | After  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| J1  | **Setting, client and record.** The organization's `contentJudgement` fields and the Content judgement card on `/admin/settings` (Judge content only); the OpenRouter client (§4.1) with the questions module shared with the eval runner (§4.2); the `contentJudgement` type (§7.1); the OpenRouter subprocessor entry and the conditional `/privacy` section (§13.1, §13.2); the `PRIVACY_OPERATIONS.md` lines (§13.3). Demo: an organizer turns it on and OpenRouter appears on that conference's `/privacy`; off, it disappears and no call can be made. | —      |
| J2  | **Orphan sweep** (§12): the daily cron and its tests (a Judgement whose content is deleted by each existing path is gone after one run).                                                                                                                                                                                                                                                                                                                                                                                                                     | J1     |
| J3  | **Comments judged, triage strip.** Judging on `submitFeedback()` with re-judging and deletion (§6); the summary (§7.2); the triage strip, collapsed text and percentages (§8.2); Keep records who and when; the tally document and its writes for Hide, Remove and Keep (§7.3). Demo: an abusive comment shows "Likely unsafe: may be abusive (88%)" within seconds; Keep stops the advice and adds one disagreement.                                                                                                                                        | J1     |
| J4  | **Wall Posts judged, covered photos.** The one-call caption + photo judging with the image guard (§4.3); the covered photo, which part, not-judged pills (§8.1); Approve all skipping flagged posts; tally writes on Approve and Reject. Demo: a QR-lure photo arrives covered with "May be an ad or a QR-code lure (86%)"; Approve all leaves it Pending.                                                                                                                                                                                                   | J3     |
| J5  | **Message Category judged.** `message.origin` set at the system call sites (§6); category judging on a person's opening; event categories for system openings; `conversation.messageCategory` (§7.2). Demo: a speaker's "can I get a visa letter?" opening gets Travel and visa; a withdrawal relay gets Proposal status without a call.                                                                                                                                                                                                                     | J1     |
| J6  | **Inbox chip, filter and sort.** The row chip, the server-side filter and sort inputs with the keyset change, the thread-header menu, organizer override, uncertain guesses (§8.3), and the tally at first resolve. Demo: filtering by Travel and visa shows only those Conversations; changing a category survives a reload and is never overwritten.                                                                                                                                                                                                       | J3, J5 |
| J7  | **Enforcement.** The Enforce switches with their disabled reasons (§10.3); the gate file and gate computation (§10.2); hiding a comment from the speaker's view with the 10-minute wait (§10.1); holding a Wall Post in Not shown; the "automatically" labels and reversal counting as disagreement. Demo with a test gate file: a comment scoring 0.95 on an enforced question never reaches the speaker until Keep; with no passed question the switch says why it is disabled.                                                                            | J3, J4 |
| H1  | **Held-out text set for feedback comments** (§11.2): a human task; then commit its numbers to the gate file. Gates enforcement, blocks no build.                                                                                                                                                                                                                                                                                                                                                                                                             | J1     |
| H2  | **Private nudity/gore image set** (§11.2): a human task; numbers only. Gates photo enforcement, blocks no build.                                                                                                                                                                                                                                                                                                                                                                                                                                             | J4     |

**User steps** (before the first organization turns it on in production):
set `OPENROUTER_API_KEY` in Vercel; set a monthly credit limit on the
OpenRouter key; confirm zero data retention is on for the account; and send
TypeSafe questions 2 and 6 from `docs/research/jev-data-terms.md` (branch
`research/jev-data-terms`) about Telemetry and OpenRouter-routed traffic.

### 14.1 Tickets

Filed under the parent implementation issue once this spec is merged; the
table of slice → issue is added in the same PR.

## 15. Verification

- **Tenancy:** every new query is conference-scoped except the tally's, which
  is annotated; executed-GROQ tests, not mocks, prove a Judgement from one
  conference never shows in another.
- **Never-fail:** tests prove a submit, a Wall Post and a message all succeed
  when the client throws, times out, returns 402, or returns too few input
  tokens; the content then shows as not judged.
- **No content at rest or in logs:** tests assert the Judgement record holds
  no text and the client never logs request bodies.
- **The image guard** is sabotage-checked like the eval runner's.
- **The questions module is shared:** a test asserts the eval runner and
  production build byte-identical requests for one item per surface.
- **Evals re-run** on every change to the question set or model build, and
  their reports are committed (`evals/content-judgement/results/`).
- **A live smoke** per surface slice with a staging key, against a test
  conference, before the slice is called done.

## 16. Known gaps and risks

- **Norwegian quality** is measured only on the development set.
- **No held-out set exists yet**, so nothing can be enforced at launch; that
  is by design.
- **Photo recall for nudity and gore is unmeasured** until H2 exists; spam
  photo recall missed the bar by one borderline item (#1576).
- **TypeSafe's Telemetry licence** may or may not reach OpenRouter-routed
  traffic (#1574). If it does, message categorization alone is reconsidered.
- **Image input is experimental** at TypeSafe and runs in its slower
  long-context mode on OpenRouter; the format may change. The image guard
  catches a silent drop, not a format change that still passes tokens.
- **OpenRouter drops unknown fields silently**, so a renamed field can look
  like success; the guard and the live smoke are the defence.
- **Answers vary between calls** (about 90.8% repeat agreement in TypeSafe's
  own test); a borderline item can flip between advice and none.
- **Shadow agreement is biased upwards** and volume is low (a conference
  produces a handful of flagged items per surface), so the shadow bar takes
  several conferences per question.
- **Content may contain instructions** aimed at the classifier; the questions
  tell Jev to treat them as content, which is not a guarantee.
