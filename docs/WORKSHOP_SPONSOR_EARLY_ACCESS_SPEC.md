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
- **Sign-in.** The link does not travel through it (§5).
- **The organizer's manual sign-up**, which checks neither the window nor the ticket today.
- **Every email that names when sign-up opens.** They keep naming the official opening.

## 2. Terms

| Term                | Meaning                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official opening    | `conference.workshopRegistrationStart`. When sign-up opens for everyone.                                                                                         |
| Sponsor start time  | A new time on the conference, earlier than the official opening. One per conference, the same for every sponsor.                                                 |
| Early-access window | From the sponsor start time until the official opening. It exists only when both times are set and the sponsor start time is the earlier one.                    |
| Early-access link   | A link that belongs to one sponsor of one conference (`sponsorForConference`). At most one is live per sponsor at a time.                                        |
| Live link           | A link whose token is the one stored on its sponsor. A revoked link is not live, and neither is a link that never existed. The two are not told apart to anyone. |
| Early access        | What a browser has after it opened a live link: a cookie naming that link. It is checked against the stored token every time it is used.                         |
| Early sign-up       | A sign-up that was admitted by early access: made inside the early-access window by a person whose browser had it.                                               |

## 3. The sponsor start time and one window rule

- **A new field on the conference** holds the sponsor start time, a `datetime` like the two beside
  it. The `conference` schema is append-only and this only adds.
- **It is set where the other two are set**: `WorkshopRegistrationSettings` and
  `workshop.admin.updateRegistrationTimes`. A save is refused when it would leave a sponsor start
  time that is not earlier than the official opening, or a sponsor start time with no official
  opening. Today the procedure refuses only an end that is not after the start.
- **With no sponsor start time, links grant nothing.** They can still be created, sent and opened.

**The window is decided in three places today**, each with its own copy of the comparison: the
`workshop.signup` procedure, the portal page (`src/app/(workshop)/workshop/page.tsx`) and the list
(`src/components/workshop/WorkshopList.tsx`). A fourth, `isWorkshopRegistrationOpen` in
`src/lib/conference/state.ts`, is called only by its own test and disagrees with the other three:
it answers "closed" when either time is unset, where they treat an unset time as no limit on that
side.

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

## 4. The link

- **The token is new and separate** from `sponsorForConference.registrationToken`. That one opens
  the sponsor's own portal, with its contacts and billing details, and must not be what a sponsor
  forwards to every employee.
- **It is stored on the `sponsorForConference`**, one field. It is random and unguessable, and it
  is created the way `generateRegistrationToken` (`src/lib/sponsor-crm/registration.ts`) creates
  its token: written only if none is stored, so two organizers creating at once end up with the
  same link.
- **The address is on the portal's working host.** It is built from `workshopPortalUrl`
  (`src/lib/workshop/sign-in.ts`), the link the sign-up emails carry, and not from the host the
  organizer happens to be on: the cookie of §5 is bound to the host that sets it. When the
  conference has no working portal, no link can be created, and the organizer is told why.
- **Revoking removes the stored token.** The link and every cookie set from it stop being live at
  once. Sign-ups already made through it stay, with their sponsor still recorded (§6). Creating or
  sending again stores a new token, so the old address never works again.
- **Any read that looks a link up by its token carries the conference**, so a token of one
  conference never resolves on another conference's host.

## 5. Opening the link

A new route under `/workshop` takes the token.

- **It first answers as the portal does** for a host or a conference without workshops, before any
  lookup of the token.
- **A live link sets the cookie and forwards to the portal page.** The cookie holds the token and
  nothing else. It is `HttpOnly` and bound to the host (`hostCookie` in
  `src/lib/workshop/central-sign-in/cookies.ts`), and it expires at the official opening. Opening a
  second sponsor's link replaces it: the latest link counts.
- **A link that is not live forwards to the portal page with a notice**: "This early access link
  is no longer valid". An existing cookie is left as it is.
- **The cookie is why this works at all.** Sign-in sends the browser to the portal page and
  carries nothing from the address it started at (`src/lib/workshop/central-sign-in/redeem.ts`), so
  a token in the address would be lost by a person who is not yet signed in.
- **The link works signed out.** The person then sees the portal's signed-out view, signs in, and
  comes back to the portal with the cookie already there.

## 6. Sign-up

`workshop.signup` keeps its order: the attendee gate first, then the window, then the workshop,
the duplicate check and capacity.

- **Early access is looked up only when it can matter**: the gate has passed, the request carries
  the cookie, and the window rule would refuse the caller without it. A refused caller, and every
  caller after the official opening, causes no lookup.
- **The lookup is live.** The procedure reads the sponsor whose stored token equals the cookie's,
  within the conference, without a cache. This is what makes a revoke take effect on the next
  attempt.
- **The sign-up records the sponsor** in a new field on `workshopSignup`, a reference to the
  `sponsorForConference`. It is written only for an early sign-up (§2). A sign-up made after the
  official opening records nothing, cookie or not. The reference is weak, so a sponsor can still be
  removed from the conference.
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
- **The page resolves the cookie to its sponsor to render the first two rows.** That read happens
  only for a request that carries the cookie before the official opening. It must not be a live
  Sanity read on each view: it is cached, and creating or revoking a link invalidates it. The
  procedure of §6 is the authority; the page only decides what to show.
- **A cookie whose link was revoked is treated as no cookie.** The person sees the portal as
  everyone does, with no notice. The notice appears only on opening a link.
- **With a link opened and no sponsor start time set**, the person sees the portal as everyone
  does. The banner appears once a time is set.
- Times are shown with `src/lib/time.ts`, as the page shows the official opening.

## 8. Sending the link, and the sponsor's record

**The sponsor's record** gets a section beside the one for the sponsor's portal link
(`SponsorPortalSection` in `src/components/admin/sponsor-crm/`).

- With no link: an action to create one and an action to send the email.
- With a link: its address with a copy button, a revoke action that asks first and says what it
  does (new early sign-ups through this link stop; sign-ups already made stay), and the count of
  §9.
- Only a sponsor with a won deal can have a link, the rule the registration send applies today.

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
  window (§2), when the official opening has passed, when the portal has no working host, and from
  localhost. The copy button is not affected by the first two.
- **The audit record** is the one every send writes. It contains the link, in the body and in the
  listed attachments, as a registration send's record contains the portal link. After a revoke the
  record shows a link that no longer works.
- Recipients are chosen in the modal as for every kind. One sponsor at a time.

## 9. What organizers see

- **In the sign-up list on `/admin/workshops`**, an early sign-up carries a badge: "via
  _Sponsor_". When the sponsor is no longer in the conference, the badge says "early access".
- **A filter** narrows the list to early sign-ups, and to those of one sponsor. It is applied on
  the server (`workshopSignupFiltersSchema`), not to the page of rows the browser happens to hold.
- **On the sponsor's record**, the section of §8 shows how many early sign-ups were made through
  this sponsor's links, confirmed and waitlisted together, and links to the list filtered to that
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
  is by decision. Revoking is the remedy, and the badge of §9 is how the sign-ups it let in are
  found.
- **The recorded sponsor says which link was used, not who employs the person.**
- **Early access is per browser.** A person who opened the link on a phone opens it again on a
  laptop.
- **The cookie expires at the official opening as it stood when the link was opened.** If
  organizers move the official opening later afterwards, people who opened the link before the
  change open it again.
- **A time edited in Sanity Studio can lag**, as today: the window is read from the cached
  conference, and only the admin page's save invalidates it.
- **Old audit records keep a revoked link's address.** It does nothing.
- Not in scope: sending to all sponsors in one action, showing the link in the sponsor's own
  portal, a limit per link or per workshop, a start time per sponsor or per tier, and any change to
  the organizer's manual sign-up.

## 12. Slices

1. #1345: the sponsor start time and the one window rule (§3). No attendee sees a difference.
2. #1346: the link from end to end: create, copy and revoke on the sponsor's record, the route and
   the cookie, the sign-up gate and the recorded sponsor, the portal, and `/privacy` (§4, §5, §6,
   §7, §8 first part, §10).
3. #1347: the "Workshop early access" kind in the Send action (§8 second part).
4. #1348: the badge, the filter and the count (§9).

Slice 2 follows 1. Slices 3 and 4 follow 2 and are independent of each other. #1344 is
separate from all four and gates only the first production use.
