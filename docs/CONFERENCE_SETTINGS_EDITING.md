# Conference Settings Editing

## Overview

The admin **Settings** page (`/admin/settings`) lets organizers edit a
conference document **in the app, without ever opening Sanity Studio**. It is the
"Studio-elimination" surface: a read-only page of `InfoCard`s, each with an Edit
affordance that opens a scoped form, patches **only** its own fields through a
dedicated `conference.*` tRPC mutation, and re-renders the server card. This
document covers the patch invariant and cache revalidation, the shared fieldset
editor, the richer editor islands, the safety guards, and the create-next-edition
wizard.

All mutations live in `src/server/routers/conference.ts`; their Zod validators in
`src/server/schemas/conference.ts`; the shared client editor in
`src/components/admin/EditConferenceCard.tsx`.

## The field-scoped patch invariant

Every settings mutation funnels through `applyConferencePatch(conferenceId,
input, opts?)`. Two invariants make it safe:

- **Conference id is SERVER-DERIVED.** Each mutation resolves the id from the
  request domain via `resolveConferenceId()` — **never** from client input — so a
  crafted request can only ever edit the conference it is already on.
- **Field-scoped, never a whole-document replace.** The patch touches **only**
  the keys of its own fieldset (following the tickets-router precedent). Within a
  validated input, `undefined` leaves a field untouched, an explicit `null`
  **unsets** it (routed to Sanity `.unset()`), and a provided non-null value is
  `.set()`. Object fieldsets (e.g. `sponsorshipCustomization`) pass a
  `pathPrefix` so the patch writes dot paths under the parent and `setIfMissing`s
  it first — a save never clobbers sibling subfields it doesn't render.

### Cache-tag revalidation

After a successful commit, `applyConferencePatch` busts the cached conference
read with **two** revalidations:

```ts
revalidateTag('content:conferences', 'default')
revalidateTag(`sanity:conference-${conferenceId}`, 'default')
```

`content:conferences` is the broad tag every `getConferenceForCurrentDomain`
consumer shares (so the server-rendered settings page and public pages reflect
the change); `sanity:conference-<id>` is the per-document tag. Both are needed so
the edit is visible on the next render without waiting out the cache TTL.

## The shared fieldset editor (`EditConferenceCard`)

`EditConferenceCard` is a single, **fieldset-parameterized** editor: an Edit
pencil on a read-only card opens a `ModalShell` form scoped to one fieldset,
patches it via the matching mutation, then `router.refresh()`es. It is
deliberately generic — every scalar/list fieldset drives the **same** code path
from two tables:

- **`FIELDSET_DEFS`** — the single source of truth for what each fieldset
  contains (field name, label, type, validation hints). Field `name`s are
  verified against `sanity/schemaTypes/conference.ts`; the server Zod schemas are
  the authoritative validators (this table only drives the form + light
  client-side hints).
- **`MUTATION_BY_FIELDSET`** — maps each `ConferenceFieldsetKey` to its
  `conference.*` mutation.

Renderers cover `text`/`textarea`/`date`/`email`/`url`/`number`/`boolean`, plus
three richer ones: a **`string-list`** (add/remove/reorder strings with per-row
URL/hostname validation and an optional known-value checkbox strip), an
**`object-list`** (the same row machinery over multi-column objects — vanity
metrics, sponsor benefits — with text/textarea/select columns), and a
**`rich-text`** renderer wrapping the shared `PortableTextEditor` (the
landing-page Announcement). A fieldset may also be flagged **`dangerous`**, which
adds a warning banner and a type-to-confirm gate driving a red Save (the Domains
editor uses it).

## Dedicated editor islands

Fieldsets that need to fetch data or offer richer interactions live in their own
components rather than the `FIELDSET_DEFS` table, mounted in the relevant card's
header on the settings page:

- **`OrganizersEditor`** — edits `organizers[]` (the canonical organizer set).
- **`TopicsEditor`** — edits the CFP topic references.
- **`TeamsEditor`** — edits organizer teams (the soft routing lens; see
  `ORGANIZER_TEAMS.md`).
- **Branding** — the logo slots (`logoBright`/`logoDark`/`logomarkBright`/
  `logomarkDark`), edited through the SVG-sanitizing branding editor.

## The guards

Several settings mutations carry a **server-authoritative** guard — the client
mirrors it for UX, but the server is the authority a crafted request cannot
bypass:

- **Domains strand-guard.** `updateDomains` derives the request's current host
  server-side and rejects (`BAD_REQUEST`) any payload that would strand it
  (`domainsWouldStrandHost`, `src/lib/conference/domains.ts`). The client mirrors
  this with a locked, non-removable row + a type-to-confirm gate. The same pure
  helpers (`domainServesHost`) are used verbatim on both sides so they can never
  disagree about which entry serves the current host.
- **Organizer self-lockout.** `updateOrganizers` refuses to let the acting
  organizer remove **themselves** (they'd lose their own admin access mid-edit) —
  bound to the server-derived `ctx.speaker._id`. Removing other organizers is
  allowed.
- **Teams subset.** `updateTeams` enforces that every team member is one of the
  conference's **current** organizers (checked against the live organizer set),
  so a crafted payload cannot add a non-organizer. On success it clears the
  per-instance teams cache so routing reflects the edit immediately.
- **Topic delete-guard.** `topic.delete` (`src/server/routers/topic.ts`) refuses
  to delete a topic still referenced by any `talk` or `conference`, naming the
  count in the error, so a delete can never dangle live references.
- **SVG sanitizer.** `updateBrandingLogo` sanitizes the markup **server-side**
  (`sanitizeSvgFieldOrThrow`) before storing it; `svg: null` unsets the slot. A
  companion `sanitizeSvgPreview` runs the **same** sanitizer as a dry run
  (persisting nothing) so the editor can show exactly what will be stored — and
  what was stripped — before committing.

## The create-next-edition wizard

`conference.createEdition` seeds a **new** conference edition that clones the
current edition's **structure** (per the wizard's clone flags) with fresh dates +
domains, so an organizer never has to open Studio to bootstrap next year. The
pure building blocks live in `src/lib/conference/edition.ts` (React-free and
Sanity-client-free, so they unit-test directly and are reused verbatim by the
server mutation and the client wizard).

- **Clone-family map.** `CLONE_FAMILIES` enumerates the **structural** groups the
  wizard can copy (topics, formats, organizers, teams, sponsor tiers, contract
  templates, sponsorship copy, CFP goals, agent config, emails & channels).
  Identity fields (city/country/venue/logos/org legal info) are **always** copied;
  **content** fields (schedules, featured, announcement, vanity metrics,
  ticketing, checkin ids, registration link) are **never** copied — a new edition
  starts empty. Reference-carrying **per-conference** documents (`sponsorTier`,
  `contractTemplate`) are cloned into brand-new docs pointing at the new
  conference (contract-template tier refs are remapped to the cloned tiers, or
  dropped when that tier wasn't cloned). Per-edition **content** documents (talks,
  schedules, reviews, conversations, …) are never cloned; **global** docs (topics,
  people, global templates) attach automatically.
- **Global domain uniqueness.** The wizard's domains must not shadow any existing
  edition's routing. `fetchClaimedDomains()` gathers every domain claimed by any
  conference; `createEdition` rejects (`BAD_REQUEST`, naming the offenders) any
  overlap — the server is the authority, `validateNewDomains` only mirrors it as
  an inline availability probe. This matters because `getConferenceForDomain`
  picks the **first** conference whose `domains[]` matches, so a duplicate would
  silently steal traffic.
- **Never touches the source.** The current conference is the **source** and is
  never modified — no patch/set touches its id. The new conference document and
  every cloned reference-carrying document are written in **one** Sanity
  transaction (all-or-nothing): a failure writes nothing, so there is no
  partial-create state and the wizard is simply re-runnable.

## Related documents

- **`ADMIN_SYSTEM.md`** — the admin surface these settings live in.
- **`ORGANIZER_TEAMS.md`** — the teams soft-lens edited by `TeamsEditor`.
- **`TRPC_SERVER_ARCHITECTURE.md`** — the `adminProcedure` / router patterns the
  settings mutations follow.
