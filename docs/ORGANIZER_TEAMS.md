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

## Adopted routing map (implemented in TEAMS-2)

The consumption layer (a separate change) wires message kinds to well-known team
keys, each with the all-organizers fallback:

- **proposal** → `cfp`
- **sponsor** → `sponsors`
- **volunteers** → `volunteers`
- **nudge / assignee** → the assignee's team → all organizers

Arbitrary additional keys beyond the well-known four are allowed; the constant is
the routing map's anchor, not an allow-list.

## Greenlit lenses (TEAMS-3)

Four further lenses are greenlit on this foundation, all still soft: a team
inbox/triage view, per-team dashboards, per-team digest scheduling, and
team-scoped assignment suggestions. None of them introduce access boundaries.

## Foundation scope (TEAMS-1)

Schema (`conference.teams[]`), the `src/lib/teams` module, the admin settings
Teams sub-display, and a `conference.teams` system-status check. The settings
display is server-rendered and there is no story infra for that tier, so it has
the same visual-QA gap as the rest of the settings page.

## Related documents

- **`MESSAGING_UX.md`** — the messaging surface these teams will route.
- **`MESSAGING_SYSTEM.md`** — data model, channel contract, recipient resolution.
