# Workshop sign-up: early access for sponsors

Decided in a design interview on 2026-10-12 (issue #1343) and checked against the code before
writing. The rule this builds on is the registration window that `workshop.signup` enforces in
`src/server/routers/workshop.ts`.

## 1. What changes

Workshop sign-up opens for everyone at one time, `conference.workshopRegistrationStart`. Organizers
want the people a sponsor sends to be able to sign up before that.

After this work:

- **Each sponsor can have one early-access link** (§4). Organizers send it to the sponsor, and the
  sponsor passes it on to its people.
- **A person who opened the link can sign up from the sponsor start time** (§3), a third time next
  to the two the conference has today. Everyone else still waits for the official opening.
- **The link is the proof.** Nothing checks that the person works for the sponsor. They must hold a
  workshop ticket, as everyone must.
- **Each early sign-up records the sponsor whose link was used** (§6), and organizers see it (§9).
- **Organizers send the link through the existing Send action** and can copy or revoke it on the
  sponsor's record (§8).

Unchanged:

- **Who may sign up.** `requireWorkshopAttendee` and `decideWorkshopPortalAccess` decide as today:
  a signed-in person with a verified email and a ticket that grants workshops. The link moves the
  start earlier and does nothing else.
- **When sign-up closes** (`workshopRegistrationEnd`), the duplicate check, capacity and the
  waitlist.
- **Sign-in and sign-out.** The link does not travel through sign-in (§5), and signing out leaves
  early access where it is.
- **The organizer's manual sign-up**, which checks neither the window nor the ticket today.
- **Every email that names when sign-up opens.** They keep naming the official opening.

## 2. Terms

| Term                | Meaning                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Official opening    | `conference.workshopRegistrationStart`. When sign-up opens for everyone.                                                                                     |
| Sponsor start time  | A new time on the conference, earlier than the official opening. One per conference, the same for every sponsor.                                             |
| Early-access window | From the sponsor start time until the official opening. It exists only when both times are set and the sponsor start time is the earlier one.                |
| Early-access link   | A link that belongs to one sponsor of one conference (`sponsorForConference`). At most one is live per sponsor at a time.                                    |
| Live link           | A link whose token is the one stored on its sponsor's published document. A revoked link is not live, and neither is one that never existed (§4).            |
| Early access        | What a browser has after it opened a live link: a cookie holding that link's token. It counts only while the link is live, which is checked when it is used. |
| Early sign-up       | A sign-up that was admitted by early access: made inside the early-access window by a person whose browser had it.                                           |

## 3. The sponsor start time and one window rule

- **A new field on the conference** holds the sponsor start time, a `datetime` like the two beside
  it. The `conference` schema is append-only and this only adds.
- **It is set where the other two are set**: `WorkshopRegistrationSettings` and
  `workshop.admin.updateRegistrationTimes`. A save is refused when it would leave a sponsor start
  time that is not earlier than the official opening, or a sponsor start time with no official
  opening. The only check the procedure makes on the order of the times today is that the end is
  after the start.
- **The schema carries the same rule as validation**, so a time edited in Sanity Studio is checked
  too. A combination that breaks the rule anyway is no early-access window (§2).
- **With no sponsor start time, links grant nothing.** They can still be created, copied and
  opened. They cannot be sent (§8).

**Whether a person can sign up is decided in three places today**, each with its own copy of the
comparison: the `workshop.signup` procedure, the portal page
(`src/app/(workshop)/workshop/page.tsx`) and the list (`src/components/workshop/WorkshopList.tsx`).
`isWorkshopRegistrationOpen` in `src/lib/conference/state.ts` is a fourth copy, called only by its
own test, and it disagrees with the other three: it answers "closed" when either time is unset,
where they treat an unset time as no limit on that side.

After this work one pure function decides it, and the three call it. It takes the conference's
three times, the current time and whether the caller has early access, and answers one of: not
open yet (with the time it opens for this caller), open, closed. `isWorkshopRegistrationOpen` and
its test are removed.

| Now is                                     | Without early access        | With early access          |
| ------------------------------------------ | --------------------------- | -------------------------- |
| Before the sponsor start time              | Not open; opens at official | Not open; opens at sponsor |
| Inside the early-access window             | Not open; opens at official | Open                       |
| From the official opening until the end    | Open                        | Open                       |
| After the end                              | Closed                      | Closed                     |
| Any time, with no early-access window (§2) | As today                    | As today                   |

Two more places compare the same times to describe the window, and neither decides who may sign
up:

- **The sign-up instructions email** (`src/lib/email/workshop.ts`) keeps describing the official
  opening.
- **The status label in `WorkshopRegistrationSettings`** (with both times set: "Not yet open",
  "Currently open" or "Closed") is computed from the function and gains one state for the
  early-access window, so organizers are not told "Not yet open" while sponsors' people are
  signing up.

## 4. The link

- **The token is new and separate** from `sponsorForConference.registrationToken`. That one opens
  the sponsor's own portal, with its contacts and billing details, and must not be what a sponsor
  forwards to every employee.
- **It is stored on the `sponsorForConference`**, one field. It is random and unguessable, and it
  is created the way `generateRegistrationToken` (`src/lib/sponsor-crm/registration.ts`) creates
  its token: written only if none is stored, so two organizers creating at once end up with the
  same link.
- **The address is on the portal's working host**, with the token in the path. It is built from
  `workshopPortalUrl` (`src/lib/workshop/sign-in.ts`), the link the sign-up emails carry, and not
  from the host the organizer happens to be on: the cookie of §5 is bound to the host that sets it.
  When the conference has no working portal, no link can be created, and the organizer is told
  why.
- **Only a sponsor with a won deal can be given a link**, the rule the registration send applies
  today. The rule is checked when a link is created or sent. A link that exists keeps working if
  the deal later leaves that state: only revoking ends it.
- **Create and revoke are organizer actions on this conference's sponsor.** Each checks that the
  sponsor belongs to the conference the request is for (`requireDocumentInCurrentConference`, as
  the Send action does) before it reads or writes anything about that sponsor.
- **Revoking removes the stored token.** The link and every cookie set from it stop being live.
  Sign-ups already made through it stay, with their sponsor still recorded (§6). Creating or
  sending again stores a new token, so the old address never works again. A sign-up that had already passed the
  lookup of §6 when the revoke landed goes through: it counts as one already made.
- **Only the published document counts, and its unpublished copies are kept in step.** The
  server's authenticated Sanity clients see Studio drafts as well as published documents, so a
  draft made while a token was stored would keep matching after a revoke. Every read that looks a
  link up excludes drafts and release copies. Create writes the token to every unpublished copy of
  the sponsor that exists, and revoke removes it from every one, so publishing a copy can neither
  drop a live link nor bring a revoked one back. Release copies are visible only to a raw read at
  Sanity API version 2025-02-19 or later; finding and changing them follows what the speaker
  erasure does (`src/lib/speaker/erasure-assets.ts`).
- **Every read that looks a link up carries the conference**, so a token of one conference never
  resolves on another conference's host.

## 5. Opening the link

A new route under `/workshop` takes the token from its path.

- **It first answers as the portal does** for a conference without workshops, before anything is
  read about the token. On a host that cannot sign in while the conference's main host can, it
  forwards to the same address on the main host, as the portal page forwards to the main portal.
  The cookie must be set by the host the person will sign up on. When the main host cannot sign in
  either, it forwards to the portal page, which says sign-up is not available, and sets nothing.
- **A live link sets the cookie and forwards to the portal page.** The cookie holds the token and
  nothing else. It is `HttpOnly` and bound to the host (`hostCookie` in
  `src/lib/workshop/central-sign-in/cookies.ts`), and it expires at the official opening. Opening a
  second sponsor's link replaces it: the latest link counts.
- **With no official opening ahead, a live link sets nothing.** When the conference has no
  official opening, or it has passed, sign-up is already open to the person or already closed, and
  a cookie would have no expiry to take. The route forwards to the portal page and shows no
  notice. A link that is not live gets the notice below whatever the times are.
- **A link that is not live forwards to the portal page with a notice**: "This early access link
  is no longer valid". An existing cookie is left as it is. A token that never existed, a revoked
  one and one of another conference are answered identically.
- **Every answer of the route is uncached and sends no referrer**, as the sign-in routes' forward
  to the portal is (`toPortal` in `src/lib/workshop/central-sign-in/decision.ts`), so the token
  does not travel on to another site.
- **The route makes no read that depends on the token.** Anyone can call it with any token.
  Deciding whether the host can sign in is a live read, the one the portal page makes on every
  view. Beyond it, the route resolves tokens through the cached read of §7.
- **The cookie is why this works at all.** Sign-in sends the browser to the portal page and
  carries nothing from the address it started at (`src/lib/workshop/central-sign-in/redeem.ts`), so
  a token in the address would be lost by a person who is not yet signed in.
- **The link works signed out.** The person then sees the portal's signed-out view, signs in, and
  comes back to the portal with the cookie already there.

## 6. Sign-up

`workshop.signup` keeps its order: the attendee gate first, then the window, then the workshop,
the duplicate check and capacity.

- **Early access is looked up only when it can matter**: the gate has passed, the request carries
  the cookie, the conference has an early-access window, and the official opening has not passed.
  A caller the gate refuses, and every caller after the official opening, causes no lookup.
- **The lookup is live.** The procedure reads the sponsor whose stored token equals the cookie's,
  within the conference, without a cache. This is what makes a revoke take effect on the next
  attempt, and it is the authority: the cached read of §7 only decides what is shown.
- **A refusal names the day and the time of day.** Today the refusal names the day only
  (`formatDate`), which could not tell the sponsor start time from the official opening when both
  fall on one day. It uses the format the portal's banner uses (`formatRegistrationInstant` in
  `src/lib/time.ts`). A caller with early access is told the sponsor start time; everyone else is
  told the official opening.
- **The sign-up records the sponsor** in a new field on `workshopSignup`, a reference to the
  `sponsorForConference`. It is written only for an early sign-up (§2). A sign-up made after the
  official opening records nothing, cookie or not. The reference is weak, so a sponsor can still be
  removed from the conference. The write itself stores it as weak (`_weak: true` on the stored
  reference): marking the schema field weak governs Studio writes only.
- **A full workshop puts the person on the waitlist**, as it does for everyone. Early sign-ups are
  older, and `workshop.admin.updateCapacity` confirms the oldest waitlisted sign-ups first, so
  sponsor people are ahead of the public for a seat that is added later. This is by decision.
- **Cancelling is unchanged.** `workshop.cancelSignup` checks no window. A person who cancels can
  sign up again while their early access lasts.
- There is no limit on how many people use a link or how many seats they take. This is by decision.

## 7. The portal

There is no early-access page. The portal page and its list render from the window rule of §3.

| Situation                                          | What the person sees                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Early access, before the sponsor start time        | The portal with a banner: "Early access through _Sponsor_ opens _time_".                      |
| Early access, inside the window, a workshop ticket | The workshop list with sign-up enabled and a line: "You have early access through _Sponsor_". |
| Early access, signed in without a workshop ticket  | The no-ticket view the portal has today, unchanged.                                           |
| A full workshop inside the window                  | They can join its waitlist.                                                                   |
| After the official opening                         | The portal as everyone sees it. Nothing mentions early access.                                |
| Just opened a link that is not live                | The portal as they would otherwise see it, with the notice of §5.                             |

- **Without early access the page is what it is today**, including the banner that names the
  official opening. The list hides its available and full workshops until sign-up is open for the
  person looking, as it hides them from everyone before the opening today.
- **The early-access banner takes the place of the banner that names the official opening.** A
  person never sees both.
- **Early access is resolved only for a person the portal admits.** The signed-out view and the
  no-ticket view read nothing about the cookie and show nothing about early access, apart from the
  notice of §5.
- **One cached read per conference serves the page and the route**: the conference's live links,
  each with its sponsor's name. It is not keyed by what the cookie holds, so a made-up value costs
  nothing.
  - It stays on the server. The browser is sent the sponsor's name for the person's own link and
    nothing else, never the list.
  - It is filled from Sanity's origin, not its CDN (`clientReadUncached`, as the short-link
    resolver in `src/lib/marketing/short-link.ts` does). Expiring a tag does not reach the CDN, and
    a refill through it could pin the old answer.
  - Creating and revoking a link expire it at once, and so does every path that removes a sponsor
    from a conference, so the next view shows the new answer. `revalidateTag(tag, 'default')`, the
    call used across the repository, can keep serving the old answer while the new one loads; this
    read needs `{ expire: 0 }`, which makes the next request wait for it.
- **A cookie whose link was revoked is treated as no cookie.** The person sees the portal as
  everyone does, with no notice. The notice appears only on opening a link.
- **With a link opened and no sponsor start time set**, the person sees the portal as everyone
  does. The banner appears once a time is set.
- Times are shown with `src/lib/time.ts`, as the page shows the official opening.

## 8. Sending the link, and the sponsor's record

**The sponsor's record** gets a section beside the one for the sponsor's portal link
(`SponsorPortalSection` in `src/components/admin/sponsor-crm/`).

- With no link: an action to create one and an action to send the email.
- With a link: a copy action, a revoke action that asks first and says what it does (new early
  sign-ups through this link stop; sign-ups already made stay), and the count of §9.
- **The address is built when it is asked for**, on create and on copy. Finding the portal's
  working host is a live read, and viewing a sponsor's record must not make it.

**A new kind in the Send action**, "Workshop early access", next to information, contract,
registration and discount codes in `sponsor.crm.sendCommunication`.

- **Sending creates the link if the sponsor has none** and otherwise reuses the stored one, so a
  second send does not break the link in a colleague's inbox.
- **The link rides in a block the server builds and appends**, as the registration link does, so
  an edited message cannot lose it. The block names the sponsor start time and the official
  opening, says that each person needs a ticket that includes workshops and signs in with the email
  on that ticket, and says the link may be passed on to colleagues who are attending.
- **The starting text is built in** and editable in the modal, as for the registration kind. No
  template category is for this kind, so none is preselected.
- **A send is refused**, in the modal and on the server, when the conference has no early-access
  window (§2), when the official opening has passed, when the portal has no working host, from
  localhost, and for a sponsor without a won deal. Create and copy are not affected by the first
  two.
- **The audit record** is the one the Send action writes for every kind. It contains the link, in
  the body and in the listed attachments, as a registration send's record contains the portal
  link. After a revoke the record shows a link that no longer works.
- Recipients are chosen in the modal as for every kind. One sponsor at a time.

## 9. What organizers see

`/admin/workshops` has no list of all sign-ups today. Sign-ups are shown per workshop and status,
in a dialog opened from a workshop's card (`SignupDetailsModal`). Its rows come from
`workshop.admin.listSignups`, and from the page's general read of sign-ups until that answer has
arrived.

- **A badge in that dialog** marks an early sign-up: "via _Sponsor_". When the sponsor is no
  longer in the conference, it says "early access".
- **A new list, "Early sign-ups", on `/admin/workshops`** shows the early sign-ups of every
  workshop: person, workshop, status and sponsor. It can be narrowed to one sponsor. The narrowing
  is done by the server and reads every match: the page's general read of sign-ups returns the
  first hundred only, so narrowing in the browser would be wrong.
- **On the sponsor's record**, the section of §8 shows how many early sign-ups were made through
  this sponsor's links, confirmed and waitlisted together, and links to the list narrowed to that
  sponsor. It counts sign-ups, not people, and it includes sign-ups made through a link that was
  revoked since.

## 10. Privacy

- A workshop sign-up can now say which sponsor's link was used, which usually says who the person
  works for. `/privacy` names it in the workshop registration section.
- The cookie is listed with the portal's other cookies (`WorkshopSignInCookies` in
  `src/components/legal/`): what it holds, that it is set only by opening a link, and when it
  expires.
- Nothing is stored about a person who opened a link and did not sign up.
- Erasing a person's workshop sign-ups stays a separate request under
  `docs/PRIVACY_OPERATIONS.md` §5, as today. The recorded sponsor is a field of the sign-up and
  goes when the sign-up is deleted.

## 11. Known gaps

- **Capacity is checked before the sign-up is written, not as part of the write** (#1344). A
  shared start time sends many people in at the same moment. That issue is fixed first: no sponsor
  start time is set on a production conference before it has merged.
- **A forwarded link works for whoever receives it**, as long as they hold a workshop ticket. This
  is by decision. Revoking is the remedy, and §9 is how the sign-ups it let in are found.
- **The recorded sponsor says which link was used, not who employs the person.**
- **Early access is per browser.** A person who opened the link on a phone opens it again on a
  laptop. Signing out does not remove it, so the next person to sign in on a shared browser has it
  too.
- **A link outlives the deal.** Moving a sponsor out of the won state does not end its link; an
  organizer revokes it.
- **The cookie expires at the official opening as it stood when the link was opened.** If
  organizers move the official opening later afterwards, people who opened the link before the
  change open it again.
- **A time edited in Sanity Studio can lag**, as today. The window is read from the cached
  conference. Saves made through the admin invalidate that cache; a Studio edit waits for the
  cache's own refresh, which is set to six hours.
- **Old audit records keep a revoked link's address.** It does nothing.
- Not in scope: sending to all sponsors in one action, showing the link in the sponsor's own
  portal, a limit per link or per workshop, a start time per sponsor or per tier, and any change to
  the organizer's manual sign-up.

## 12. Slices

1. #1345: the sponsor start time and the one window rule (§3), and the refusal that names the
   time of day (§6). Nobody can sign up earlier yet.
2. #1346: the link from end to end: create, copy and revoke on the sponsor's record, the route and
   the cookie, the sign-up gate and the recorded sponsor, the portal, and `/privacy` (§4, §5, §6,
   §7, §8 first part, §10).
3. #1347: the "Workshop early access" kind in the Send action (§8 second part).
4. #1348: the badge, the list and the count (§9).

Slice 2 follows 1. Slices 3 and 4 follow 2 and are independent of each other. #1344 is separate
from all four and gates only the first production use.
