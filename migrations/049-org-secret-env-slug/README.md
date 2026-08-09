# Migration 049: Backfill `organization.secretEnvSlug`

## ⏳ NOT YET RUN IN PRODUCTION

Run it via the **Run Sanity Migration** workflow
(`.github/workflows/run-migration.yml`, migration id
`049-org-secret-env-slug`) **before** the PR that removes `TENANT_ENV_SLUGS`
is deployed. The workflow exports a dataset backup and dry-runs first.

## What it writes

| Document                         | Field           | Value  |
| -------------------------------- | --------------- | ------ |
| `organization-cloud-native-days` | `secretEnvSlug` | `CNDN` |

That is the value the deleted code constant held, quoted here as a literal
rather than imported from the module it is being removed from — importing it
would make the migration write whatever that constant later became, or fail to
compile once it was gone.

## Why it exists

RunKonf/platform#57 moved the tenant → env-var-slug mapping out of
`TENANT_ENV_SLUGS` (`src/lib/secrets/env-per-org.ts`) and into the
`organization` document, so `TENANT_<SLUG>_<FAMILY>_<FIELD>` variable names are
resolved from Sanity rather than from source. Until this has run, the deployed
code cannot name CNDN's existing `TENANT_CNDN_*` variables:

- **email** resolves to `null`, so CNDN drops back to the platform Resend
  account with the sender policy re-applied;
- **ticketing** resolves to `null`, so its surfaces read "unconfigured".

Both are the pre-#57 behaviour rather than an outage — which is why this is
sequenced "run before deploy" rather than treated as a hard gate.

## Why a migration rather than a hand-edit

The field is deliberately hard to change once set: the Studio renders it
`readOnly` when populated, and its validation rule refuses a change against the
published value, because the Vercel variables it names would orphan. That makes
the **first** write the one that has to be right, and a reviewed, dry-runnable,
idempotent migration is how a one-shot write becomes reviewable.

It is also the **escape hatch**: an `unset` run from here is how a genuine
correction is made (unset, then set the new value, in the same sitting as
renaming the Vercel variables).

## Safety

- **Additive and conditional.** Writes only when `secretEnvSlug` is absent. A
  re-run patches nothing; an existing value is never overwritten.
- **One document, one field.** Never deletes, never touches anything else,
  skips drafts.
- **Aborts rather than guessing**, before yielding a single patch, if:
  - `organization-cloud-native-days` is missing or is not an `organization`
    (this migration is written for the Cloud Native Days dataset only);
  - it already carries a **different** non-empty slug — re-keying would orphan
    the `TENANT_<existing>_*` variables silently;
  - another organization already claims `CNDN` — a shared slug makes the
    resolver refuse **both** orgs.
- The value is checked against the same `secretEnvSlugProblem` vocabulary the
  schema and the resolver use, so it cannot write something the resolver would
  later reject as malformed.

## Verifying it afterwards

```sh
npx sanity documents query '*[_type == "organization" && defined(secretEnvSlug)]{_id, secretEnvSlug}'
```

Expect exactly one row: `organization-cloud-native-days` → `CNDN`. More than
one row sharing a value is the state the resolver refuses.
