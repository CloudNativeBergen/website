# Speaker Erasure Runbook (RunKonf/platform#52, Phase 1)

How a platform operator answers a **right-to-erasure request (GDPR Article 17)**
from a speaker. It covers who may run the operation, how identity is verified,
the exact steps, and — in its own section, because it is the part that is easy to
get wrong when replying to the person — **what this does not erase.**

**The model is anonymise in place.** The `speaker` document and every reference
to it survive; identifying fields are overwritten and the listed operational
records are deleted or scrubbed. Decided 2026-08-06 over two alternatives:
weakening references for a real delete (several consumers assume a speaker
resolves, so a missed read path becomes a public 500) and cascade delete
(destroys data belonging to people who requested nothing — a co-speaker's talk, a
reviewer's review).

> This runbook is the mechanism. `docs/PRIVACY_OPERATIONS.md` §5 is the
> surrounding DSR process (intake, 30-day deadline, appeal path to Datatilsynet);
> start there and come here when the request is an erasure from a speaker.

**Code:** `src/lib/speaker/erasure.ts` · **CLI:** `pnpm erase-speaker`

---

## The one sentence you may say, and the one you may not

**You may not say "we erased your data."** It would be false. Free text is left
to the retention clocks (owner decision, 2026-08-14), so a mention of an erased
person can survive **up to two years** in a review comment or a message body, and
**indefinitely** in a published talk abstract.

The accurate claim, which is available immediately and needs no caveating:

> We anonymise your account and delete the operational records listed below.
> Free-text content authored by or referring to you — talk abstracts and
> outlines, review comments, message bodies — is governed by our stated
> retention periods rather than deleted on request, and some records are
> retained under a legal obligation. The full list is below.

Enumerate the surviving categories from
[what Phase 1 does not erase](#what-phase-1-does-not-erase) in the reply. Do not
summarise them as "some technical data".

---

## Who may run this

| Actor                    | May run it                           | Why                                                                                                                  |
| ------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Platform operator**    | **Yes**, after identity verification | A speaker is a global, cross-organization person document, and the right belongs to the person.                      |
| The speaker themselves   | Not yet                              | Self-service (`speaker.eraseSelf`) is Phase 3. Until then a speaker's request is handled out of band by an operator. |
| An organizer / org admin | **No**                               | Standing over a shared person is an accident of membership, not consent. An organizer may only _file_ a request.     |

The operation is **global and never org-scoped**. It is deliberately not exposed
in `/admin` and there is no tRPC surface for it in Phase 1 — the only entry point
is the CLI, run by someone with the production write token.

## Verifying identity before you run anything

Erasure is irreversible. Verify **before** the first write, not after.

1. **Establish the requester controls an address in the document's match set.**
   The match set is the speaker's `email` plus every entry in `knownEmails`.
   Read it with the dry run in step 2 — the plan prints the document id, and the
   match set is what the email-keyed sweeps use.
2. **Reply from the platform to that address and require a reply**, or require
   the request to arrive from it. A request arriving from any other address is
   not verified, however convincing it is.
3. **If the speaker can still sign in,** having them send the request from an
   authenticated session (or confirm a magic link sent to the address on file)
   is stronger and is preferred.
4. **Record the verification method** in the DSR log — `docs/PRIVACY_OPERATIONS.md`
   Appendix C has the intake fields. The `erasedAt` timestamp on the document is
   the technical record; the DSR log is the legal one.
5. **Confirm scope with the requester.** They are asking for the speaker account.
   Attendee, workshop-signup and volunteer records live on a different identity
   rail and are **not** covered — see below.

**Do not proceed** if the requester cannot be tied to an address in the match
set. An erroneous erasure destroys another person's account.

---

## The steps

### 0. Preconditions

- You have the production Sanity **write** token in the environment
  (`SANITY_API_TOKEN_WRITE`) and `NEXT_PUBLIC_SANITY_*` set.
- Identity is verified and logged (above).
- You have the speaker's document `_id`. Find it without printing personal data
  into a shared channel:

  ```sh
  # `sanity documents query` has no --param flag; inline the literal.
  # Project ONLY the _id — never the whole document into a terminal you share.
  npx sanity documents query \
    '*[_type=="speaker" && "person@example.com" in knownEmails]{_id}'
  ```

  A bare `count()` prints an error from this CLI, so wrap any count as
  `{"n": count(...)}`. **Never paste banking values, emails or names into a
  ticket, a chat or a PR.**

### 1. Dry run, and read it

```sh
pnpm erase-speaker <speakerId> --actor "Your Name"
```

Dry run is the default; `--commit` is required to write anything. The output
lists every dependent patch and delete, the profile image asset id, and — the
part to read closely — **any travel-support record whose banking details will be
retained.**

Check the three things a dry run is for:

- **Refusals.** If the plan refuses, fix the cause and re-run (see
  [refusals](#refusals-and-what-to-do-about-them)). Nothing has been written.
- **Retained banking.** Every `travelSupport` record listed as retained will
  still hold beneficiary/IBAN/SWIFT afterwards. Paid records are retained under
  legal obligation and **must be named in your reply**. An `UNRECOGNISED STATUS`
  line means the fail-closed rule fired — check that record by hand before
  continuing.
- **Legacy off-schema fields.** Sanity is schemaless on write and GROQ cannot
  enumerate keys, so the field list cannot be derived from the document. Fetch
  the raw document and eyeball it for anything the erasure list does not name:

  ```sh
  npx sanity documents get <speakerId>
  ```

  If you find an identifying field that is not in `ERASURE_UNSET_FIELDS`, stop
  and add it to `src/lib/speaker/erasure.ts` — do not unset it by hand, or the
  next run will not know about it.

### 2. Commit

```sh
pnpm erase-speaker <speakerId> --actor "Your Name" --commit
```

Every document mutation goes in **one transaction, and every patch in it —
including the speaker's own — carries `ifRevisionId`**. If anyone edits an
affected document between the read and the commit (a speaker saving their own
profile is the likeliest case), the whole transaction fails with a 409 and
nothing lands. Re-run it: the operation is idempotent, so re-running is always
safe.

### 3. Confirm the image asset was deleted

Unsetting `speaker.image` removes the pointer; the photograph stays live and
publicly fetchable on `cdn.sanity.io`. The script deletes the asset **after** the
transaction (Sanity refuses to delete an asset with a live reference) and only if
nothing else still points at it.

Read the `Image asset:` line:

- `deleted <id>` — done.
- `none` — the speaker had no uploaded image (an OAuth avatar URL is in
  `imageURL`, which is unset by the patch).
- `NOT deleted (… remainingReferences=N)` with **N > 0** — another document
  shares the asset. It is correct not to have deleted it; note it and move on.
- `NOT deleted (… remainingReferences=0)` or `-1` — the delete or the count
  failed. **Copy the asset id now** — the reference is gone, so a re-run cannot
  rediscover it — and delete it by hand once the cause is fixed:

  ```sh
  npx sanity documents delete <assetId>
  ```

### 3b. Confirm the marketing images were deleted (#1162)

Every image of the person the marketing tools hold goes — not through the
orphan check above, but **unconditionally**. The plan links:

- gallery assets (`marketingAsset`) whose subject is the speaker or a talk they
  give;
- and, for any `marketingTask` whose subject is either, every render the Task
  names: its `asset`, its `pendingStudioAsset`, and its `replacedRenders` — the
  earlier renders a re-render replaced that could not be deleted yet, usually
  because a post it was handed to still holds it. A replaced render is recorded
  there in the same save that replaces it, so the record cannot be lost.

Every document holding one of those files — found by the file's own
references, drafts and Content Release versions included — lets go of it in the
transaction: gallery entries are deleted, posts and their variants lose the
attachment (the post keeps its text), Tasks lose the render and the
`replacedRenders` entry. Then the files are deleted.

The dry run lists them under `Marketing files`. The transaction records their
ids on the erased speaker (`erasedFileIds` — asset ids, no personal data),
because once their links are stripped nothing else leads to them. After the
commit, read the `Marketing files:` line. Any file `NOT deleted` is still
counted by `--verify` (from the record), and **a re-run retries it**: fix the
cause and re-run step 2. `--files <id,id>` adds ids to a verification by hand.

**The hole.** An image no subject and no Task names is linked to nobody and is
not found: a group photo or collage with no subject, a render saved from a Task
that had no subject, an image **attached to a post by hand** — even a post
about the speaker, since it may as easily be a sponsor's graphic — or a render
that outlived its **Task's deletion**. Deleting a Task sends every render it
names through the orphan check, and with the Task gone nothing links a
surviving file to the speaker. One survives when:

- **any** other document still references it — a post is the usual holder,
  but any document counts, a weak reference included;
- its reference count or delete **failed** — logged at error level as
  `Render <id> of a deleted Task could not be cleaned up`, with no retry
  record, so search the logs and delete it by hand;
- it was written to the Task **while** a Campaign or plan delete was running
  (the renders are read before the first chunk).
  `/privacy` tells people to tell us about such an image; when they do, delete it
  from the gallery by hand. Published posts on Bluesky or LinkedIn are outside
  our reach either way.

### 4. Invalidate caches

`revalidateTag` needs a Next.js request scope, which the script has none of, so
it prints the tags rather than pretending. Invalidate them:

- `content:speakers`
- `content:speaker-detail`
- `sanity:conference-<id>` for each conference listed

Use the existing cache-invalidation route
(`src/app/api/provisioning/cache/invalidate`) or a redeploy. Then check the
public profile in a **Safari Private tab** — a stale PWA service worker will
otherwise serve you an old bundle and you will report a failure that is not one.

Known and **not** fixed by this operation: `/speaker/<old-slug>` soft-404s with
HTTP 200 and no `noindex` (pre-existing, website#818), so the old URL may linger
in search indexes.

### 5. Verify

```sh
pnpm erase-speaker <speakerId> --verify
```

The commit in step 2 **already printed a verification**, and that is the one to
file with the DSR record: it is the only run that still had the person's
addresses and could therefore check the email-keyed sweeps. This standalone
`--verify` re-derives everything from the `_id`, so it is a genuine independent
check of the document fields, the image asset and every reference-borne
residual — but it cannot recount anything keyed on an address. See
[the limit](#the-limit---verify-on-its-own-cannot-recount-the-trail) before
quoting its `CLEAN` at anyone.

If it reports residual data, re-run step 2 — the operation converges.

### 6. Prove the fixed point (first time, and after any change to the operation)

Run the commit **twice** and verify after each. The second run reports
`already erased — nothing to write`, and `erasedAt` still holds the **original**
timestamp. That is the property the whole design rests on: every value is derived
deterministically from `_id`, so a repeat is a no-op rather than a second,
different erasure.

### 7. Reply, and close the DSR record

Use the wording at the top of this document. Enumerate what survives. Record the
verification method, the `erasedAt` timestamp and the `CLEAN` verification.

---

## Refusals, and what to do about them

The plan refuses before writing anything. Every refusal is deliberate.

**"<type> <id> holds an image linked to the subject …; remove it by hand and
re-run."** A marketing file linked to the person is also held by a document the
erasure does not know how to strip — a photo-gallery frame or another speaker's
profile image with the same bytes (Sanity stores identical bytes once), or a
post attachment whose `_key` cannot be selected safely. The file cannot be
deleted while that document holds it, so nothing has been written. Decide what
that document should lose, change it by hand, then re-run.

**"X is the only organizer of conference Y."** `conference.organizers[]` is
`min(1)`, and an organization with no organizer cannot be administered by anyone
— the erasure would strand the tenant and everyone in it. **Appoint a replacement
organizer first**, then re-run. This is a scheduling delay, not a refusal of the
request; tell the requester the erasure is in progress.

**"Target slug is already used by Z."** The anonymised slug is
`deleted-<first 8 characters of _id>` and another document already holds it.
Investigate before forcing anything — two speakers on one public URL is worse
than a delayed erasure.

**"Speaker X has a mergedWith entry naming the subject whose `_key` … cannot be
safely selected; clear it by hand."** The merge trail is patched by addressing
one array entry (`mergedWith[_key=="…"]`), and this entry's `_key` is not a shape
that can be put in a selector safely. Nothing has been written. Fix the entry,
then re-run:

1. Read the trail and find the entry — it is named in the refusal:

   ```sh
   npx sanity documents get <thatSpeakerId>
   ```

2. Clear the personal parts of that one entry by hand in the Studio: empty
   `loserEmails`, and replace `snapshot` with the redacted shape the tool writes
   (below). Leave `mergedAt`, `actorId`, `survivorId` and `loserId` alone.
3. Re-run the dry run. The entry no longer matches, the refusal is gone, and the
   rest of the erasure proceeds normally.

Do **not** delete the whole entry and do not give it a new `_key` to get past the
refusal — the refusal exists because an entry we cannot address is an entry we
cannot promise is clean.

The operation also refuses a draft document, a document that is not a `speaker`,
and an `_id` with an unexpected shape.

---

## The merge trail (`mergedWith`)

A merge folds a duplicate speaker into a survivor and **deletes** the duplicate,
keeping a copy of it in an entry of the survivor's `mergedWith[]` array — the
only account of a deletion that has already happened, and the only way to undo
one by hand.

**Whose erasure this actually matters for.** A correct duplicate merge leaves the
person a live survivor document; a request from them lands on it and the whole
`mergedWith` array is unset with the rest of the profile. The case the sweep
exists for is the **mis-merge** — two different people folded together, so one
person's record now sits in **another person's** trail. Nothing points at it, and
GROQ cannot read inside the snapshot, so without a dedicated sweep the erasure
completes over a live copy of their name, address and bio. The merge writes
`loserEmails`, a normalised address list, as the handle that makes it findable.

**What erasure does to an entry: redacts, does not delete.** The structural
record survives and the values go:

| Kept                                                                                         | Dropped                                                                                                                  |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `mergedAt`, `actorId`, `survivorId`, `loserId`, and the snapshot's `fields` and `references` | `snapshot.loser` (the deleted document), `snapshot.survivorBefore` where it is the subject's, `loserEmails`, `actorName` |

A redacted snapshot carries `loserRedactedAt: <timestamp>` and nothing personal.
**An operator reading one should not read the gaps as data loss** — the merge is
still fully explained (when, by whom, which side each field came from, how many
documents were repointed); only the person in it is gone. An unparseable snapshot
is replaced outright with `{ loserRedactedAt, unreadable: true }`, because a blob
we cannot read is not a blob we can promise is clean. `actorId` is retained and
resolves to the anonymised placeholder, exactly like every other audit reference.

### The limit: no live speaker document, no erasure

The tool works from the subject's **live** `speaker` document. If they have none,
`pnpm erase-speaker` fails with **`Speaker not found`** before doing anything —
so a person whose only account was wrongly merged away, and who has not signed in
since, **cannot be reached by this tool at all.** This is a real gap, not a
technicality.

What to do instead:

1. Find the entry by address (the match key is normalised — lowercase it):

   ```sh
   npx sanity documents query \
     '*[_type=="speaker" && count(mergedWith[count(loserEmails[@ == "person@example.com"]) > 0]) > 0]{_id}'
   ```

2. Redact those entries by hand in the Studio, to the shape in the table above.
3. Record in the DSR log that the erasure was manual and why — there is no
   `erasedAt` timestamp to point at, and no `CLEAN` verification, so the DSR log
   is the only record that it happened.

If the person **can** sign in, having them do so first creates a fresh speaker
document and the normal flow applies — the sweep reaches the trail entry through
their address, not through the new document's id.

### The limit: `--verify` on its own cannot recount the trail

Step 5's standalone `--verify` re-derives everything from the `_id`, and after a
successful erasure the `_id` no longer leads to any address: `email` is the
placeholder and `knownEmails` is gone. Every **email-keyed** count therefore has
nothing to select on and comes back **0 whether or not anything is left** —
invitations, sign-in tokens, ticket entries, and the merge trail.

The verification that runs **as part of `--commit`** does not have this problem:
it is handed the match set read before the transaction. So:

- The `CLEAN` line printed by the **commit** run is the one to file with the DSR
  record. It covers the email-keyed residuals.
- A later standalone `--verify` proves the document fields, the image asset and
  the reference-borne residuals, and nothing more. Do not file it as evidence
  that the email-keyed sweeps succeeded.

---

## The blind spot to check whenever the schema changes

The sweep finds dependent data two ways: `*[references($speakerId)]`, which
follows references, and a **targeted read for documents that record a person by
their plaintext email address instead.**

**The second kind is invisible to the first.** There is no reference to follow —
and that is the _normal_ shape for an invitation, which exists precisely because
the person may not have an account yet. Miss one and this operation fails in its
worst possible way: the sweep completes, the verification query reports
**CLEAN**, and a document carrying the person's address (and, for an invitation,
a **live bearer token** to their mailbox) survives. We would have told them it
was gone.

It has already happened twice. `coSpeakerInvitation` was caught during
implementation. `organizerInvitation` shipped three days earlier (website#880)
and was missed — **and its production count was zero, so no test and no
production query could have found it.** A count of zero is the _dangerous_ case
here, not the safe one: an invite-gated launch means the first real use creates
the hole.

Currently swept: `coSpeakerInvitation.invitedEmail`,
`organizerInvitation.invitedEmail`, `emailSignInToken.identifier`,
`talk.issuedSpeakerTickets[].email`, and `speaker.mergedWith[].loserEmails` (see
[the merge trail](#the-merge-trail-mergedwith)). All matched case-insensitively —
`loserEmails` is written already normalised, so it needs no `lower()`.

**If you add a document type with an email field**, decide whether it can hold a
speaker's address. If it can, add it to `EMAIL_KEYED_ERASURE_SITES` and to the
query in `fetchErasureInputs` (`src/lib/speaker/erasure.ts`).
`erasure.emailKeyed.test.ts` scans every schema and fails until the new field is
recorded with a disposition, so the next one is caught at review rather than by
an erasure that quietly under-delivered. Do not silence it — record the
disposition.

`emailSignInRateLimit` is deliberately not on the list: it stores only a salted
hash of the address, never the address itself.

## What Phase 1 does NOT erase

**Read this before replying to the person.** Each item survives the operation and
belongs in the reply.

### Free-text content — the big one

Owner decision, 2026-08-14: free text is **left to the retention clocks**, with
no erasure-time scan.

| Content                                            | What happens                                                                                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Talk abstracts and outlines                        | **Retained indefinitely** as part of the conference record. A published abstract may name the person.                                  |
| Review comments about the person                   | Deleted by the **12-month** review retention clock, not by this operation.                                                             |
| Message bodies (speaker↔organizer)                 | Purged **24 months** after the conference (`src/lib/messaging/retention.ts`).                                                          |
| Notification titles naming the person as the actor | Hard-deleted at **90 days** by the notification purge. The reference now resolves to "Deleted speaker"; the free text does not change. |

So: **a mention can survive up to two years, and indefinitely in an abstract.**
Say so.

### Records retained under another legal basis

- **Paid travel-support records and their banking details**, and all travel
  expense **receipts**. Retained under Norwegian bookkeeping obligations. These
  are **explicitly not anonymised** and must be named as surviving. (The
  retention _period_ is with the accountant; "retained under legal obligation;
  retention period under review" is accurate today.)
- **Invitation letters** (`invitationLetter`) — the audit trail of immigration
  letters actually issued.
- **Organizer audit references** — `sponsorActivity.createdBy`,
  `travelSupport.reviewedBy`, `invitationLetter.issuedBy` and similar. These now
  resolve to the placeholder, which is anonymise-in-place working as intended.

### Out of scope for Phase 1 by decision

- **Badges** (`speakerBadge`). `badgeJson` embeds the plaintext name and email
  inside a **signed** credential served publicly with no auth, so the signature
  means it cannot be edited out. Revocation is being built in platform#46; until
  then a badge survives erasure. **Tell the requester if they have one** — check
  with
  `npx sanity documents query '{"n": count(*[_type=="speakerBadge" && speaker._ref == "<speakerId>"])}'`.
- **The residual-mention scan.** No automated search for the person's name in
  free text. Not built, by decision.
- **Self-service erasure.** Phase 3.
- **Gallery photographs.** Untagging removes findability, not the face. The
  photograph is retained: conference photography is group photography, and
  deleting the frame would destroy an image of other people who requested
  nothing. A **tombstone reference** stays in `untaggedSpeakers[]` — it is what
  stops an organizer re-tagging the person later, and it points at the
  anonymised document, not at a person.

### Different identity rail — not covered, and worth saying explicitly

`workshopSignup`, `volunteer` (name, email, **phone**, dietary restrictions) and
attendee/ticketing records are keyed on their own identities, not on the speaker
document. **A speaker erasure does not touch them.** If the requester also has
one of these, handle it as a separate DSR under
`docs/PRIVACY_OPERATIONS.md` §5.

### Outside the dataset entirely

- **Sanity revision history.** Overwriting a field does not purge prior
  revisions. The retention window on our plan is **not yet verified with Sanity**
  — the outstanding pre-DPA check. Until it is answered, do not claim the
  previous values are gone.
- Operator-machine exports, Resend send logs, push endpoints held by browser
  vendors, and visitors' service-worker caches.

---

## What the operation does erase

For completeness, and so the reply can be specific.

**On the `speaker` document** — `name` becomes `"Deleted speaker"`, `slug`
becomes `deleted-<first 8 of _id>`, `email` becomes
`deleted-<first 8 of _id>@anonymous.invalid`. These three are **replaced, never
unset**: several code paths dereference them without a guard, so unsetting them
would turn admin lists and public pages into 500s. The `.invalid` domain is
RFC 2606 — undeliverable, and it can never be a verified OAuth email.

**Unset:** `knownEmails`, `providers`, `imageURL`, `image`, `links`, `bio`,
`title`, `flags`, `gender`, `genderSelfDescribe`, `country`,
`pushSubscriptions`, `pushPreferences`, `messagingEmailDefault`, `mergedWith`
(their own merge trail, dropped whole — it holds copies of other people's deleted
records), `consent.dataProcessing.ipAddress`.

**Kept:** `_id` (referential identity — the point of the decision),
`organizations` (tenancy guards read it; unsetting makes the document
unmanageable), and the consent **proof** fields `granted` / `grantedAt` /
`privacyPolicyVersion`. Whether to keep the consent proof at all is an open
Phase 2 decision; retaining is the conservative side of it.

**Elsewhere:** the profile image **asset** is deleted from the CDN (not just its
reference); every marketing image linked to them is removed from the gallery,
posts, variants and Tasks and its file deleted (see step 3b); the person is untagged from gallery images; their notifications,
conversation preferences, dashboard configs and reminder logs are deleted;
co-speaker invitations **and organizer invitations** addressed to them, and
sign-in tokens for their addresses, are deleted; `issuedSpeakerTickets` entries carrying their email are removed from
talks; they are removed from `conference.organizers[]`, `featuredSpeakers[]` and
organizer teams; `bankingDetails` is deleted from **unpaid** travel-support
records; and any `mergedWith[]` entry in **another** speaker's merge trail that
carries them is redacted — personal values out, the record of the merge itself
left standing (see [the merge trail](#the-merge-trail-mergedwith)).

### A property worth understanding before you answer questions about it

**The talk association survives by design, and it is externally
reconstructible.** Talk titles and abstracts are public and archived beyond our
control. Anyone who already knows who gave a particular talk can re-identify the
placeholder. Erasure-in-place removes _our_ copies of identifying data; it cannot
make the remainder unlinkable for someone holding outside knowledge. Say this
precisely if asked — do not claim anonymity that the public record defeats.

**Re-login after erasure produces a fresh account.** Matching is exclusively
`providers` and `email`/`knownEmails`, and all three are cleared, so the erased
document can never be re-attached. That is correct semantics, not a bug — but
tell the requester, so a later sign-in does not look like the erasure failed.
