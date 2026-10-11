# Workshop tickets: the list, the statistics and the reminder

Decided in a design interview on 2026-10-12 (issue #1329) and checked against the code before
writing. The rule this builds on is `workshopAccessOf` in `src/lib/tickets/classification.ts`; its
comments are the reference for how a ticket type grants workshop access.

## 1. What changes

Which ticket types let their holders sign up for workshops is already configurable per conference,
but the setting sits on each card at `/admin/tickets/types`, and `/admin/workshops` neither shows
it nor links to it. The workshops page reads sign-ups only and no ticket: nothing says how many of
the people who hold a workshop ticket have signed up.

After this work:

- **The list is edited under `/admin/workshops`** (§3).
- **The page shows statistics per person** that join ticket holders to sign-ups (§4), and flags
  sign-ups from people without a workshop ticket.
- **Every "workshop participants" number in the product uses the gate's rule** (§5).
- **An attendee's cancel removes the sign-up** instead of moving it to the waitlist (§6).
- **One button reminds the people who have not signed up** (§7). It replaces "Resend sign-up
  instructions".
- **Organizers are told when a ticket type has no decision** (§8).

Unchanged:

- **The list itself and the rule that reads it.** `conference.ticketTypeRoles[].grantsWorkshop` is
  the stored list and `workshopAccessOf` (`src/lib/tickets/classification.ts`) is the one rule. The
  portal, the sign-up procedures, the ticket-sold email and the resend already decide through it.
  This work adds no second list and no second rule.
- **A conference that has marked nothing keeps today's access.** While no entry grants workshops,
  `workshopAccessOf` matches the built-in list in the same file. The first marked type switches
  that list off for the conference.
- Who may open the portal, the plan gate, sign-in and the registration window.

## 2. Terms

| Term                 | Meaning                                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workshop ticket type | A ticket type for which `workshopAccessOf` answers `granted` for this conference.                                                                                                                                     |
| Not-set type         | A ticket type with no stored workshop answer (`grantsWorkshop` is neither `true` nor `false`) on a conference that has marked at least one type. Its holders are refused at the portal. See the note below the table. |
| Orphaned entry       | An entry in `ticketTypeRoles` whose `typeName` matches no ticket type the provider lists. The list is keyed on the name, so a rename at the provider leaves one.                                                      |
| Holder               | A person holding at least one ticket of a workshop ticket type. People are told apart by `canonicalEmail` of the address on the ticket, as the gate and resend do.                                                    |
| Confirmed            | A holder with at least one sign-up in status `confirmed`.                                                                                                                                                             |
| Waitlist only        | A holder with at least one sign-up, none of them `confirmed`.                                                                                                                                                         |
| Not signed up        | A holder with no sign-up of any kind.                                                                                                                                                                                 |
| Flagged              | A person with at least one sign-up who is not a holder: `canonicalEmail` of the sign-up's `userEmail` matches no holder.                                                                                              |

Holders, confirmed, waitlist only and not signed up always satisfy
`holders = confirmed + waitlist only + not signed up`. Flagged people are outside all four.

**The rule and the control disagree on one case today, and this work closes it.** For a type whose
entry carries only the seating answer (`admits`), `workshopAccessOf` answers `denied`, while the
control shows "Not set". Such a holder is told to upgrade their ticket when the real cause is a
decision nobody made. After this work `workshopAccessOf` answers `unclassified` for an entry with
no workshop answer, as it does for a type with no entry. Nobody gains or loses access by it: both
answers refuse. The refusal text changes to the one that names the missing decision, and the type
counts as not set in §3, §4 and §8.

## 3. The list under `/admin/workshops`

- A "Workshop tickets" section lists every ticket type the provider returns
  (`fetchPublicTicketTypes`, the provider-neutral call the ticket-types page uses) with its
  three-way answer: grants access, does not, not set.
- It is the existing control and the existing mutation (`tickets.admin.setWorkshopAccess`), moved.
  The confirmation that marking the first type switches the built-in list off, and its offer to
  carry the currently granted types over in the same save, moves with it unchanged.
- **Not configured is a state of its own.** While no type is marked the section says so, and names
  the built-in list that applies, so an empty list is not read as a closed gate.
- `/admin/tickets/types` keeps a read-only badge per card ("Grants workshop access", "No workshop
  access", "Not set") that links to the section. It no longer edits.
- **A banner above the statistics** names each not-set type and each orphaned entry. An orphaned
  entry has a remove action. Once the statistics exist (§4) the banner also says how many people
  hold each not-set type and are refused.

## 4. Statistics

One server function is the join. It reads the event's tickets and the conference's sign-ups and
returns the five groups of §2 plus the people locked out per not-set type. The reminder (§7) takes
its recipients from the same function, so the number beside the button and the number of emails a
press sends cannot be computed two ways.

- **Roles are read live**, as the gate reads them (`liveTicketTypeRoles`), so the statistics follow
  an edit immediately.
- **Tickets** come through the shared memo (`fetchEventTicketCandidates`) for the page, and are
  read fresh for a send (§7), as the resend reads them today. The join takes that choice as an
  option. A ticket read is slow when it is not memoised, so the ticket-side numbers load after the
  page.
- **When the provider cannot be read** the sign-up numbers the page shows today still render, and
  the ticket side says it is unavailable. It never shows zero for a read that failed.
- **The page shows** holders, confirmed, waitlist only, not signed up, and flagged. The sign-up
  totals the page has today stay. They count sign-ups, except "Unique Participants", which counts
  people by WorkOS id across confirmed and waitlisted sign-ups; the new numbers count people by
  email.
- **Flagged opens a list**: name, email and workshops, with the remove action the page already
  has ("Delete signup"). People an organizer added by hand are in it like anyone else; a
  sign-up does not record how it was made.
- **Nothing is cancelled automatically.** A sign-up whose owner no longer holds a workshop ticket
  (the type was unmarked, the ticket refunded or changed) stays, and its owner is flagged.

## 5. One definition of a workshop participant

`classifyTicket(...).grantsWorkshop` (`src/lib/tickets/classification.ts`) starts from
`workshopAccessOf` and then overrides it for the speaker ticket type: a speaker counts only when a
form answer on the ticket says they attend the workshops. The gate has no such rule, so a speaker
can sign up and still be missing from the count.

The override goes. `grantsWorkshop` becomes exactly `workshopAccessOf(...) === 'granted'`. This
changes, in the same direction:

- "Workshop Participants" on `/admin/tickets`, with its paid and free split,
- the same number and its paid and comps split in the weekly Slack update,
- the `grantsWorkshop` column and the workshop-only filter of the participant export,
- the same tally where it is returned by `tickets.admin.summary` and `status.admin.summary`.

These surfaces tell people apart by a lowercased address, with or without trimming. They move to
`canonicalEmail`, so a padded address is one person on every page.

On a conference where the speaker type grants workshops, built-in list included, each of these
rises by the speakers who gave no workshop answer.

## 6. Cancel

Today an attendee's cancel (`workshop.cancelSignup`) sets the sign-up to `waitlist`
(`cancelWorkshopSignup` in `src/lib/workshop/sanity.ts`). A waitlist then holds people waiting for
a seat and people who backed out, and nothing tells them apart. It is not only a counting problem:
when an organizer raises a workshop's capacity, `workshop.admin.updateCapacity` confirms the
earliest waitlisted sign-ups and emails them, so a person who backed out can be given a seat.

- **An attendee's cancel deletes the sign-up.** The ownership and tenancy checks before it stay.
- No `cancelled` status is added.
- `workshop.admin.batchCancelSignups` also sets `waitlist`. No component calls it, so organizers
  have no such action today and nothing is relabelled. This work leaves the procedure as it is
  (§9).

## 7. The reminder

"Resend sign-up instructions" becomes "Remind people who haven't signed up".

- **Recipients** are the not-signed-up group of §2, read fresh at the moment of sending. Waitlist
  only is not in it.
- **Refusals stay**: no portal link, registration closed, the ticket provider or the email sender
  unavailable, and at most one send an hour per conference. As today, a press that sent nothing
  does not use up the hour.
- **Wording.** The email says that the ticket includes workshops and that the recipient has no
  seat yet, a statement about the ticket that stays true for someone who signs up between the
  press and the read. The instructions email has three registration states today (before the
  window, open, closed). The reminder uses the first two: before the window it says when sign-up
  opens, as today; while it is open it says when sign-up closes, which the email does not say
  today. It is never sent after the window, because the send is refused then.
- **The organizer's note** is optional plain text, at most 1,000 characters, escaped, shown above
  the standard text.
- **The dialog** shows how many people will receive it and when the last reminder went out and to
  how many.
- **The last send is stored** in two new fields on the conference: when, and to how many. The
  schema is append-only and this only adds. They are written after a send that reached at least
  one person, and a failure to write them never fails the send.
- The ticket-sold email is not changed.

## 8. Not-set types reach the organizer

A new notification tells organizers that a ticket type has no decision and links to
`/admin/workshops`.

- **Two triggers, one event.** A ticket of a not-set type is sold (the Checkin webhook; Tito has no
  sale webhook), or an attendee is refused at the portal because their ticket type is not set (any
  provider).
- **Once per type.** A type that already has this notification for the conference is not notified
  again.
- It follows the notification hub's rules in `AGENTS.md`: one document per organizer in one
  transaction, emitted from a bus handler since two call sites raise it, and a failed write never
  fails the webhook or the refusal.
- **The refusal path runs on every request of a refused attendee.** Deciding whether a type was
  already notified must not add a live Sanity read to each of those requests.

## 9. Known gaps

- **A ticket with no email address** belongs to no holder and is not counted. Its owner can sign
  in but is refused at the portal as having no ticket, since the ticket cannot be matched to them.
- **Sign-ups cancelled before §6 ships** stay on the waitlist; they cannot be told from people
  waiting, and a capacity increase can still confirm them.
- **`workshop.admin.batchCancelSignups` keeps a name that says cancel and a behaviour that
  waitlists.** Nothing in this repository calls it. Whether it is removed or renamed is open; a
  caller outside the repository was not ruled out.
- **Organizer-added sign-ups are flagged** when their email holds no workshop ticket. This is by
  decision: the flagged number does not separate deliberate additions.
- **A rename at the provider** still locks holders out until an organizer marks the new name. §3
  and §8 make it visible; they do not prevent it.
- **Notifications are deleted after 90 days**, so a type left not set for longer can be notified a
  second time.
- **The hourly limit on the reminder lives in server memory**, per instance, as today. The stored
  last send is what tells a second organizer that one went out.
- Not in scope: a breakdown per ticket type, a speaker split of the holders, sign-up numbers in
  the weekly Slack update, and lists for the groups other than flagged.

## 10. Slices

1. #1331: an attendee's cancel deletes the sign-up (§6).
2. #1332: the list under `/admin/workshops`, the badge and the banner, and the rule's answer for an entry
   with no workshop answer (§2, §3).
3. #1333: the statistics, the flagged list and the one definition (§4, §5).
4. #1334: the reminder (§7).
5. #1335: the notification for not-set types (§8).

Slices 1, 2 and 5 are independent. Slice 3 follows 1, so "waitlist only" means what it says, and
slice 4 follows 3, whose join it sends from.
