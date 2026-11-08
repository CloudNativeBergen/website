# Billing and self-serve sign-up

The API contract for billing and closed-preview sign-up (#2129). Plan rules
and gates: `docs/AUTHORIZATION.md` §4.1. Who may call what: §4 rows
`billing.*` and `signup.*`.

## Status

| Operation                       | Lane     | Gate                  | State                                         |
| ------------------------------- | -------- | --------------------- | --------------------------------------------- |
| `Organization.billing`          | tenant   | `billing.read`        | Built                                         |
| `startCheckout(plan, currency)` | tenant   | `billing.manage`      | Authz and refusals built; `NOT_IMPLEMENTED`   |
| `openBillingPortal`             | tenant   | `billing.manage`      | Authz built; `NOT_IMPLEMENTED`                |
| `POST /billing/stripe/webhook`  | none     | Stripe signature      | Documented; not built                         |
| `signUpOrganization`            | user     | `signup.create_org`   | Authz and slug check built; `NOT_IMPLEMENTED` |
| `createSignupCode`              | operator | `signup.manage_codes` | Built                                         |
| `signupCodes`                   | operator | `signup.manage_codes` | Built                                         |
| `revokeSignupCode(id)`          | operator | `signup.manage_codes` | Built                                         |

Every resolver checks the caller before it reads anything. A refusal is
`FORBIDDEN`; bad input is `BAD_USER_INPUT` with `extensions.reason =
INVALID_INPUT` and `extensions.field`.

## Billing

`Organization.billing` holds `plan`, `effectivePlan`, `planSource`,
`subscriptionStatus`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `compUntil` and
`graceUntil`. It is null unless the caller is an owner or admin of that org
on the tenant lane, or an operator acting for it there. `graceUntil` is set
only while a Stripe subscription is `past_due`: `current_period_end` plus 14
days, the moment `effectivePlan` drops to `free` and the org goes read-only.

`startCheckout(plan: BASIC | PRO, currency: EUR | USD | NOK)` returns a
Checkout URL. Billing is yearly only (owner decision). Org owner only. It
refuses a demo org (`kind = demo`, read from the envelope) and an org on an
active complimentary plan, both with `field: organization`.

`openBillingPortal` returns a Stripe customer-portal URL. Org owner only.

### Stripe webhook

`POST /billing/stripe/webhook` on tenant-directory, behind the gateway. Not
built here (phase 2, needs the Stripe test keys).

- The `Stripe-Signature` header is verified before the body is parsed. An
  invalid signature gets 400 and nothing is read or written.
- Each event id is stored in `stripe_events` first; a repeat is a no-op.
- It writes only the plan columns of `organizations`: `plan`, `plan_source =
stripe`, `stripe_customer_id`, `stripe_subscription_id`,
  `subscription_status`, `current_period_end` and `cancel_at_period_end`.
  It never touches a `comp` org.

## Self-serve sign-up (closed preview)

`signUpOrganization(input: { name, slug }, inviteCode: String!)` is for any
signed-in user on a session with no tenant. When built, it creates in one go:
the org (plan `free`, kind `customer`), the caller as owner, the first draft
edition, the host `<slug>.konf.app` in closed preview, and one spent use of
the code. It reuses the internals of `provisionConference` (#2114). The name
differs from the operator's `createOrganization`, which already exists with
another input; GraphQL allows one field per name.

What this PR builds of it:

- **Slug:** lowercase `a-z`, `0-9` and `-`, 3 to 40 characters, not starting
  or ending with `-`. Reserved names (`packages/tenancy/src/reserved.ts`, the
  one list the site and tenant-directory share), existing org slugs and
  existing hosts (`<slug>.konf.app`, `<slug>.konf.run`) are refused with the
  same message, so the check reveals no more than the public hosts do.
- **Codes:** table `signup_codes` (migration 0011). Only the SHA-256 of a
  code is stored. The plain code appears once, in the `createSignupCode`
  result. `consumeSignupCode` spends a use in one conditional `UPDATE`: not
  revoked, not expired, uses left.

Still to build: the provisioning write, the per-user attempt limit (a Workers
rate-limit binding keyed on the user, counted before the code lookup) and the
email verification the PRD asks for.
