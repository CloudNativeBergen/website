# Roadmap

## Goal

A coherent multi-tenant SaaS. `api.konf.app` is the only door (site, Kontroll, CLI); D1 owns structured data; Sanity holds only editorial content; one identity login across all Konf services with any linked account (GitHub, LinkedIn); Kontroll is the self-service control plane for organizations, with an operator view.

## Where we are (as of 2026-11-06)

Tenants, domains, identity, and memberships live in D1. Gateway has an operator lane. Kontroll runs on identity login and the API (org, members, invites, operator views, editing). Core conference settings (16 fields) are read and written only in D1 for all 4 conferences (`d1_override=1`, #2013); Sanity copies are frozen; `lifecycleStatus` still also lives in Sanity.

## Milestones

| Milestone  | Goal                                                                         | Key issues                                      | Owner if known |
| ---------- | ---------------------------------------------------------------------------- | ----------------------------------------------- | -------------- |
| Platform 1 | Core fields on D1 (lifecycle to D1, lint guard, delete frozen Sanity fields) | #1997                                           |                |
| Platform 2 | Settings phase 1                                                             | #2019                                           |                |
| Platform 3 | Self-service onboarding                                                      | #1924, #1981, #1985, #1977                      |                |
| Platform 4 | Operations and observability                                                 | #1895, #1917, #1814, #1929, #1769, #1870, #1771 | randax         |
| Platform 5 | Gateway hardening                                                            | #1877, #1789, #1962, #1954, #1967, #1949, #1957 |                |
| Platform 6 | Cleanup (env lists, fallbacks, next-auth retirement, docs)                   |                                                 |                |

## Later phases

- Settings phases 2–5 (see [DATA_OWNERSHIP.md](./DATA_OWNERSHIP.md) phasing table)
- Proposals and speakers
- Tickets
- Logos in R2 (#1866)

## Decisions taken

Decisions taken (2026-11-06):

- Settings phase 1 next
- Workers Paid later
- Milestones plus ROADMAP for tracking
- Aggressive mode with revert path
- Fable review only for security, auth, PII and data deletion

## Decisions deferred

| Decision                                                  | Trigger to decide                                                                 | Who |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- | --- |
| Delete frozen Sanity fields                               | After lifecycle is in D1 and the lint guard is merged, plus one clean parity week |     |
| Workers Paid                                              | When Platform 4 is ready to move crons, or crons are needed                       |     |
| Settings phases 2–5 order                                 | After phase 1 lands                                                               |     |
| Speaker model (identity, global profile, sharing, directory) and where proposals and tickets live; design in #2022 | Before CFP, proposals and speakers move (after #2019) | Owner |
| Retire next-auth                                          | After #1981 and identity login covers all users                                   |     |
| Owner of D1 lifecycle (tenant-directory vs conference D1) | Decided in the lifecycle PR                                                       |     |

## How we work

See #1994 and related documentation:

- [PLATFORM.md](./PLATFORM.md)
- [DATA_OWNERSHIP.md](./DATA_OWNERSHIP.md)
- [OBSERVABILITY.md](./OBSERVABILITY.md)
- [CONFERENCE_FIELDS.md](./CONFERENCE_FIELDS.md)
