// Billing phase 1 (#2129): the plan vocabulary, the effective-plan rule and
// the plan dimension of the policy. Pure: tenant-directory supplies the row,
// the gateway mints the result into the envelope.
import { createGraphQLError } from 'graphql-yoga'

export const PLANS = ['free', 'basic', 'pro'] as const
export type Plan = (typeof PLANS)[number]
const RANK: Record<Plan, number> = { free: 0, basic: 1, pro: 2 }

export const isPlan = (v: unknown): v is Plan =>
  typeof v === 'string' && v in RANK

/** Days a `past_due` subscription keeps its plan after the period ends. */
export const GRACE_DAYS = 14
const DAY_MS = 86_400_000

/** The billing columns of `organizations` (migration 0008). */
export interface BillingRow {
  plan: string | null
  planSource: string | null
  subscriptionStatus: string | null
  /** ISO 8601. */
  currentPeriodEnd: string | null
  /** ISO 8601; null means no end. */
  compUntil: string | null
  /** organizations.kind (#2150); omitted means customer. */
  kind?: string | null
}

const after = (iso: string | null, now: number, plusMs = 0) => {
  const t = iso ? Date.parse(iso) : NaN
  return !Number.isNaN(t) && t + plusMs > now
}

/**
 * The plan the platform enforces (#2129 "Effective plan"):
 * - comp: the granted plan while `comp_until` is unset or in the future;
 * - stripe: the paid plan while `active`, or `past_due` within GRACE_DAYS
 *   of `current_period_end`;
 * - anything else (default, canceled, incomplete, expired, unknown): free.
 * Fails closed: an unknown plan value is free.
 * A demo org (#2150) is pro whatever its billing columns say. It is never
 * billed: phase 2's Stripe checkout must refuse an org with kind `demo`.
 */
export function effectivePlan(r: BillingRow, now = Date.now()): Plan {
  if (r.kind === 'demo') return 'pro'
  const plan = isPlan(r.plan) ? r.plan : 'free'
  if (r.planSource === 'comp')
    return r.compUntil === null || after(r.compUntil, now) ? plan : 'free'
  if (r.planSource === 'stripe') {
    if (r.subscriptionStatus === 'active') return plan
    // ponytail: grace counts from current_period_end; phase 2 may store
    // past_due_since if Stripe's period roll makes this too generous.
    if (
      r.subscriptionStatus === 'past_due' &&
      after(r.currentPeriodEnd, now, GRACE_DAYS * DAY_MS)
    )
      return plan
  }
  return 'free'
}

/**
 * The plan dimension of docs/AUTHORIZATION.md §4: the least plan each
 * paid-only action needs (owner decisions on #2115 and #2129). Role checks
 * (`can()`) still apply first; this only narrows.
 */
export const PLAN_GATES = {
  /** Publishing an edition that sells tickets (ticketingProvider set). */
  'conference.publish_ticketed': 'basic',
  /** Setting a custom hostname on an edition. */
  'domain.connect_custom': 'basic',
  /** Org API clients (docs/API_CLIENTS.md). */
  'api_client.create': 'basic',
  /** A personal access token with any write scope. */
  'pat.create_write': 'basic',
} as const satisfies Record<string, Exclude<Plan, 'free'>>

export type PlanGate = keyof typeof PLAN_GATES

/** True when `plan` covers `gate`. An unknown plan is free. */
export const planAllows = (plan: unknown, gate: PlanGate): boolean =>
  RANK[isPlan(plan) ? plan : 'free'] >= RANK[PLAN_GATES[gate]]

/**
 * Throws the stable refusal the gateway passes on (BAD_USER_INPUT,
 * reason PLAN_REQUIRED, requiredPlan) unless `plan` covers `gate`.
 */
export function requirePlan(plan: unknown, gate: PlanGate): void {
  if (planAllows(plan, gate)) return
  const requiredPlan = PLAN_GATES[gate]
  throw createGraphQLError(`this needs the ${requiredPlan} plan`, {
    extensions: {
      code: 'BAD_USER_INPUT',
      reason: 'PLAN_REQUIRED',
      requiredPlan,
    },
  })
}

/**
 * When a `past_due` stripe subscription drops to free (read-only): the end of
 * the grace that effectivePlan allows, current_period_end + GRACE_DAYS.
 * ISO 8601; null in every other state.
 */
export function graceUntil(r: BillingRow): string | null {
  if (r.planSource !== 'stripe' || r.subscriptionStatus !== 'past_due')
    return null
  const t = r.currentPeriodEnd ? Date.parse(r.currentPeriodEnd) : NaN
  return Number.isNaN(t)
    ? null
    : new Date(t + GRACE_DAYS * DAY_MS).toISOString()
}
