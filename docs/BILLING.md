# Billing and self-serve sign-up

The API contract for billing and closed-preview sign-up (#2129). Plan rules
and gates: `docs/AUTHORIZATION.md` §4.1. Who may call what: §4 rows
`billing.*` and `signup.*`.

## Status

| Operation                       | Lane     | Gate                  | State                                       |
| ------------------------------- | -------- | --------------------- | ------------------------------------------- |
| `Organization.billing`          | tenant   | `billing.read`        | Built                                       |
| `startCheckout(plan, currency)` | tenant   | `billing.manage`      | Authz and refusals built; `NOT_IMPLEMENTED` |
| `openBillingPortal`             | tenant   | `billing.manage`      | Authz built; `NOT_IMPLEMENTED`              |
| `POST /billing/stripe/webhook`  | none     | Stripe signature      | Documented; not built                       |
| `signUpOrganization`            | user     | `signup.create_org`   | Built                                       |
| `createSignupCode`              | operator | `signup.manage_codes` | Built                                       |
| `signupCodes`                   | operator | `signup.manage_codes` | Built                                       |
| `revokeSignupCode(id)`          | operator | `signup.manage_codes` | Built                                       |

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
signed-in user on a session with no tenant (#2163). It returns
`{ organization, conference, host }`. The name differs from the operator's
`createOrganization`, which takes another input.

Checks, in this order, each before any write:

1. **Rate limit:** `SIGNUP_LIMIT` (Workers Rate Limiting, 5 a minute), keyed
   on the user, never the code. `RATE_LIMITED` before any read.
2. **Invite code:** a hash lookup in `signup_codes` (migration 0011): it
   exists, is not revoked or expired, and has uses left. Otherwise
   `field: inviteCode`. This runs before the slug check, so a user without a
   valid code cannot probe which slugs exist.
3. **Slug:** lowercase `a-z`, `0-9` and `-`, 3 to 40 characters, not starting
   or ending with `-`, no `--` (which also refuses `xn--` punycode). Reserved
   names (`packages/tenancy/src/reserved.ts`, the one list the site and
   tenant-directory share), existing org slugs and the existing host
   `<slug>.konf.run` get one message that never repeats the slug.
4. **Name:** trimmed, 2 to 80 characters, `field: name`.

The writes, and what undoes each when a later step fails:

1. **Spend the code** (`consumeSignupCode`, one conditional `UPDATE`). Losing
   the race for the last use refuses with `field: inviteCode`; nothing is
   written.
2. **One D1 batch:** the org (plan `free`, kind `customer`, id
   `organization.<slug>`), its first edition as `draft`, and the host
   `<slug>.konf.run` (`platform-alias`, verified under the platform
   certificate). On failure (a slug race) the code use is refunded.
3. **identity `signupOwner`:** the org, the caller's `owner` membership and
   an `org.signup` audit row (actor, org id, code id; never the code) in one
   batch. On failure the step 2 rows are deleted and the use refunded.

The mutation answers only after step 3, so `myOrganizations` and the
envelope's role see the membership on the next request.

The edition exists in D1 only: no Sanity documents are written. Only the
SHA-256 of a code is stored; the plain code appears once, in the
`createSignupCode` result.

Still to build: the email verification the PRD asks for.
