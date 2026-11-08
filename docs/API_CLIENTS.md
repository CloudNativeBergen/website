# API clients and personal access tokens

Contract for #2115 (PRD: RunKonf/kontroll#70 with its amendments). The GraphQL types
and operations live in the identity subgraph (`services/identity/src/api-clients.ts`).
Every resolver runs its authorization check and then refuses with `NOT_IMPLEMENTED`,
until the implementation lands. The token endpoint is described in `api/README.md`.

## Principals

| Principal                   | `principal.type` | Authorized by                         |
| --------------------------- | ---------------- | ------------------------------------- |
| API client                  | `client`         | its scopes only (`orgRole = null`)    |
| Personal access token (PAT) | `user`           | the user's live org role ∩ PAT scopes |

- **A client** is a machine principal bound to exactly one org. The binding only decides
  which tenant envelope it gets. In `can()` it has `orgRole = null` and
  `conferenceRoles = []`, so no client ever acts as owner. Scopes map to actions in the
  same policy table, through a `principal.type` column.
- **A PAT** belongs to one user and one org. It is checked against the user's live role
  on every request, so a demotion or removal narrows or ends it at once. Scopes
  requested at creation must fit the creator's current role. PATs are self-service: only
  the user can create one, for themselves.
- **Scopes** are envelope claims. They pass through the same `verifyEnvelope` cap and
  vocabulary check as other claims, not through a separate guard. Read scopes are
  enforced too: a private read needs the matching `:read` scope.

## Scopes

`resource:read` and `resource:write`, where write implies read. In GraphQL they are the
`ApiScope` enum (`CONFERENCE_READ` stands for `conference:read`, and so on).

| Resource     | Covers (matrix actions)                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `conference` | `conference.*` except `bind_ticketing` and `manage_roles`                                                         |
| `program`    | `schedule.*`                                                                                                      |
| `cfp`        | `proposal.*`                                                                                                      |
| `sponsors`   | `sponsor.*`                                                                                                       |
| `content`    | content subgraph pages and assets                                                                                 |
| `members`    | `org.read_settings` (read only; there is no `members:write`: member and role management is never client-callable) |
| `pii:read`   | members-only PII reads (`attendee.read_pii`). Owner-granted only, off by default                                  |

No platform scope exists and none can be granted.

## Never client-callable

Whatever its scopes, a client or PAT principal can never: grant or remove roles
(`org.manage_members`, `org.manage_owners`, `conference.manage_roles`), manage clients
or PATs (`api_client.*`, `pat.manage_own`), read or write secrets (`org.write_secrets`),
change billing, or erase a person (`person.erase`). The identity resolvers refuse
anything but a tenant envelope with a signed-in user before they check the matrix.

## Who manages what

| Operation                                                                          | Matrix action       | Who                        |
| ---------------------------------------------------------------------------------- | ------------------- | -------------------------- |
| `apiClients`                                                                       | `api_client.read`   | owners, admins, operators  |
| `createApiClient`, `rotateApiClientSecret`                                         | `api_client.create` | owners only                |
| `revokeApiClient`                                                                  | `api_client.revoke` | owners, operators          |
| `myPersonalAccessTokens`, `createPersonalAccessToken`, `revokePersonalAccessToken` | `pat.manage_own`    | any org member, own tokens |

List types (`ApiClient`, `PersonalAccessToken`) never carry a secret or hash. The secret
is returned once, only by `createApiClient`, `rotateApiClientSecret`
(`ApiClientSecretPayload.clientSecret`) and `createPersonalAccessToken`
(`PersonalAccessTokenPayload.secret`). Only a hash is stored.

## Plan gating

The plan (`free | basic | pro`, from tenant-directory `organizations.plan`) is minted into
the envelope per request, and `can()` checks it on scope grants and on client counts.

| Plan  | PATs           | Write scopes | Org clients |
| ----- | -------------- | ------------ | ----------- |
| free  | read-only      | no           | 0           |
| basic | read and write | yes          | 1           |
| pro   | read and write | yes          | 5           |

Webhook counts (3 on basic, 25 on pro), MCP writes and provisioning belong to their own
issues. When the plan drops (#2129), existing write-scoped tokens stop authorizing writes;
nothing is deleted.

## Errors

Refusals use `extensions.code` and, for business refusals, a stable `extensions.reason`:

| code / reason                          | Extra field    | When                                                           |
| -------------------------------------- | -------------- | -------------------------------------------------------------- |
| `FORBIDDEN`                            |                | the caller may not perform the operation                       |
| `BAD_USER_INPUT` / `PLAN_REQUIRED`     | `requiredPlan` | a write scope or another client needs a higher plan            |
| `BAD_USER_INPUT` / `SCOPE_NOT_ALLOWED` |                | a scope above the creator's role, or `pii:read` by a non-owner |
| `BAD_USER_INPUT` / `LIMIT_REACHED`     |                | the active client or PAT cap for the org is reached            |
| `BAD_USER_INPUT` / `INVALID_INPUT`     | `field`        | empty name, no scopes, expiry missing, past or over 1 year     |
| `NOT_IMPLEMENTED`                      |                | contract only; returned after the authorization check          |

## Tokens

- Format: `konf_<type>_<id>_<secret>`, with `type` `cs` (client secret), `pat` or `at`
  (access token). The prefix lets secret scanners flag leaks. The server looks the
  record up by `id` and compares the hash in constant time; negative lookups are cached
  so invalid tokens do not hit D1.
- Access tokens from `POST /oauth/token` live 15 minutes. PATs need an expiry, at most
  one year.
- **Revoke is immediate.** Each client has a `token_version`, embedded in its access
  tokens and checked at the gateway (cached, invalidated on revoke). Revoking a client
  bumps it, so outstanding access tokens fail on the next request.
- **Rotate** issues a new secret; the old one stays valid for a short grace period.

## Audit and rate limits

- The envelope carries an actor type (`user` | `client` | `pat`) and actor id. Every write
  is audited with that actor plus the human who created the client or PAT. Operator
  list and revoke actions are written to the platform log and the target org's log.
- Rate limits apply per token and per org, not mainly per IP, so shared CI egress does
  not let one tenant starve another. Active clients and PATs are capped per org. All the
  numbers live in config, not code; they are still proposals.
