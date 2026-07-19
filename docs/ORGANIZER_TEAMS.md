# Organizer Teams

Organizer teams are an **optional soft lens over the existing organizer set**.
They exist to make notifications and outbound mail land on the _right_
organizers by default and to scope Studio pickers — nothing more. This document
records the maintainer-locked design so later phases build on the same
foundation.

## The one principle: soft lens, never access control

A team **changes who a message is aimed at by default**. It never gates what an
organizer can see or do. Every organizer remains a full organizer everywhere —
they can open any conversation, any admin surface, any sponsor. Teams only feed:

- **routing** — which organizers are the default recipients of a given message,
- **defaults** — which Slack channel / email identity a team's outbound
  communication uses,
- **filters** — the Studio reference picker for a team's members is scoped to
  the conference's organizers.

If you ever find yourself reaching for a team to _deny_ access, that is out of
scope by design. Access control is derived from organizer membership as it is
today; teams sit strictly on top.

## Unified model

Historically the routing knobs were split across proto-team fields
(`cfpNotificationChannel`, `salesNotificationChannel`, the per-kind email
identities, ad-hoc assignee references). `conference.teams[]` unifies those into
one first-class list. Each team is:

| field           | meaning                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `key`           | stable lowercase kebab-case id, unique within the array (e.g. `cfp`, `sponsors`)                     |
| `title`         | human label                                                                                          |
| `members`       | references to speakers, filtered in Studio to this conference's organizers (min 1)                   |
| `slackChannel`  | optional; overrides the conference channel for this team's notifications                             |
| `emailIdentity` | optional; which conference email identity (`contactEmail` / `cfpEmail` / `sponsorEmail`) it sends as |

The library (`src/lib/teams`) exposes the read + resolve surface:
`getConferenceTeams` (bounded, per-instance 60s TTL cache, only-cache-successes,
mirroring `getOrganizerSpeakerIds`), `resolveTeamRecipients`,
`resolveTeamSlackChannel`, `resolveTeamEmailIdentity`, and the
`WELL_KNOWN_TEAM_KEYS` constant.

## Absent means today

A conference with **no teams behaves exactly as it does today**: all organizers
receive everything. This is the load-bearing invariant. The lib never invents a
recipient set — `resolveTeamRecipients` returns `[]` for an absent team, and the
**fallback contract lives with the caller**: an empty result means "no
team-specific routing, fall back to all organizers." Keeping that decision at the
call site makes absent-means-today a single, auditable choice rather than a
hidden default buried in the resolver.

## Adopted routing map (IMPLEMENTED — TEAMS-2)

The consumption layer wires message kinds to well-known team keys, each with the
all-organizers fallback. Every rule is INERT until its team is configured: with
no team the recipient set is exactly today's all-organizers behaviour.

| Message kind                         | Team key                                          |
| ------------------------------------ | ------------------------------------------------- |
| proposal events                      | `cfp`                                             |
| speaker threads (proposal + general) | `cfp`                                             |
| travel-support (new request)         | `cfp`                                             |
| sponsor events + sponsor threads     | `sponsors`                                        |
| volunteer signups                    | `volunteers`                                      |
| stale nudge                          | assignee → thread's team (`sponsors`/`cfp`) → all |

Arbitrary additional keys beyond the well-known four are allowed; the constant is
the routing map's anchor, not an allow-list.

### The single fallback contract

One helper — `resolveRoutedOrganizerIds({ conferenceId, teamKey })`
(`src/lib/teams/routing.ts`) — is the ONLY place ABSENT-MEANS-TODAY becomes a
concrete recipient set. It returns the team's members when the team is configured
with **≥1 member**, otherwise the FULL organizer set (`getOrganizerSpeakerIds`).
An empty team is treated identically to an absent one (routing to zero organizers
is never the intent). It is **never-fail**: a teams-fetch error logs and falls
back to all organizers rather than mis-routing to a partial set. Teams are
**routing only** here — the helper's output is a notification recipient list and
never touches access, inbox visibility, or participant/party resolution.

### Routing sites

Every all-organizer notification fan-out now resolves its recipients through the
helper with the mapped key (actor-exclusion and each site's never-fail envelope
are unchanged):

- `src/lib/events/handlers/persistNotification.ts` — `submit` and
  `confirm`/`withdraw` organizer fan-outs → `cfp`.
- `src/server/routers/proposal.ts` — direct-create submission fan-out → `cfp`.
- `src/server/routers/travelSupport.ts` — NEW-request organizer alert → `cfp`
  (travel support is speaker-facing, CFP-side work). Its two speaker-facing
  status notifications are NOT organizer fan-outs and stay unrouted.
- `src/server/routers/volunteer.ts` — signup organizer mirror → `volunteers`.
- `src/server/routers/sponsor.ts` — stage-move fan-out → `sponsors`.
- `src/lib/messaging/notify.ts` — `notifyNewMessage` (speaker threads) routes the
  organizer-group RECIPIENT expansion through `cfp`; `notifySponsorMessage` →
  `sponsors`. See the access-vs-routing split note below.
- `src/lib/messaging/nudge.ts` — assignee → thread's team → all organizers.
- Slack: `sendSalesNotification` (sponsor message + sponsor events) resolves the
  `sponsors`/`sales` channel; speaker-message Slack resolves the `cfp`/`cfp`
  channel. Both fall back to today's conference channels exactly.

### Access vs routing in `notify.ts`

`notifyNewMessage` seeds TWO organizer id sets. The FULL set
(`getOrganizerSpeakerIds`) stays the **classifier** — it decides whether the
author is an organizer and whether each recipient is an organizer (which drives
the audience-dependent email default and the per-audience deep link). The ROUTED
set (`resolveRoutedOrganizerIds({ teamKey: 'cfp' })`) is used ONLY to expand the
`organizers` group party into notification RECIPIENTS. Speaker parties are
untouched by routing; only which organizers receive the fan-out narrows. Access,
`canAccessConversation`, participant/party resolution, and inbox visibility are
left entirely alone — this change adds no access boundary.

## Lenses (TEAMS-3 — IMPLEMENTED)

The four shipped lenses, all soft (visible only when teams are configured;
none introduce access boundaries):

1. **Inbox "My teams" view** — an organizer inbox tab filtering active threads
   whose ROUTING team (sponsor threads → `sponsors`, everything else → `cfp`)
   is one of the caller's teams. Inert (matches all active) for organizers on
   no team; the tab is hidden entirely when the conference has no teams.
2. **Team chips on inbox rows** — a sponsor row's amber chip shows the
   sponsors-team TITLE (fallback "Sponsor"); other rows get a quiet cfp-team
   chip. No chips when teams aren't configured.
3. **CRM team filter** — a Teams option group in the sponsor pipeline's Owner
   filter (`team=<key>` URL param → the team's member set).
4. **Dashboard "My areas" widget** — per-team needs-attention cards
   (needs-reply threads, unassigned sponsors, pending volunteers) with
   deep links, visible when the viewer belongs to ≥1 team.

Earlier aspirational candidates (per-team digest scheduling, assignment
suggestions) remain unbuilt and unscheduled.

## Foundation scope (TEAMS-1)

Schema (`conference.teams[]`), the `src/lib/teams` module, the admin settings
Teams sub-display, and a `conference.teams` system-status check. The settings
display is server-rendered and there is no story infra for that tier, so it has
the same visual-QA gap as the rest of the settings page.

## Related documents

- **`MESSAGING_UX.md`** — the messaging surface these teams will route.
- **`MESSAGING_SYSTEM.md`** — data model, channel contract, recipient resolution.
