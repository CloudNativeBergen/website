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

`CLEAN` is the evidence to file with the DSR record. It re-derives everything
from the `_id` rather than trusting the run that just happened, so it is a real
independent check and can be run days later by someone else.

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

The plan refuses before writing anything. Both refusals are deliberate.

**"X is the only organizer of conference Y."** `conference.organizers[]` is
`min(1)`, and an organization with no organizer cannot be administered by anyone
— the erasure would strand the tenant and everyone in it. **Appoint a replacement
organizer first**, then re-run. This is a scheduling delay, not a refusal of the
request; tell the requester the erasure is in progress.

**"Target slug is already used by Z."** The anonymised slug is
`deleted-<first 8 characters of _id>` and another document already holds it.
Investigate before forcing anything — two speakers on one public URL is worse
than a delayed erasure.

The operation also refuses a draft document, a document that is not a `speaker`,
and an `_id` with an unexpected shape.

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
`organizerInvitation.invitedEmail`, `emailSignInToken.identifier`, and
`talk.issuedSpeakerTickets[].email`. All matched case-insensitively.

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
`pushSubscriptions`, `pushPreferences`, `messagingEmailDefault`,
`consent.dataProcessing.ipAddress`.

**Kept:** `_id` (referential identity — the point of the decision),
`organizations` (tenancy guards read it; unsetting makes the document
unmanageable), and the consent **proof** fields `granted` / `grantedAt` /
`privacyPolicyVersion`. Whether to keep the consent proof at all is an open
Phase 2 decision; retaining is the conservative side of it.

**Elsewhere:** the profile image **asset** is deleted from the CDN (not just its
reference); the person is untagged from gallery images; their notifications,
conversation preferences, dashboard configs and reminder logs are deleted;
co-speaker invitations **and organizer invitations** addressed to them, and
sign-in tokens for their addresses, are deleted; `issuedSpeakerTickets` entries carrying their email are removed from
talks; they are removed from `conference.organizers[]`, `featuredSpeakers[]` and
organizer teams; and `bankingDetails` is deleted from **unpaid** travel-support
records.

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
