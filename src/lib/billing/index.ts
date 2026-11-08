// Billing phase 1 (#2129): the site's plan gates. The org's effective plan
// comes from the gateway (tenant-directory), read server-side as the
// signed-in organizer; nothing the client sends decides it. Fails closed:
// when the plan cannot be read, a gated action is refused as retryable.
import { TRPCError } from '@trpc/server'
import {
  identityJwt,
  orgPlanViaApi,
  requestHost,
} from '@/lib/konf-api/conference-write'

/** The plan a refused action needs; rides on the TRPCError cause. */
export class PlanRequiredError extends Error {
  readonly reason = 'PLAN_REQUIRED'
  constructor(public readonly requiredPlan: 'basic' | 'pro') {
    super(`This needs the ${requiredPlan} plan.`)
    this.name = 'PlanRequiredError'
  }
}

/** Mirrors packages/tenancy PLAN_GATES for the site's two gates. */
const GATES = {
  'conference.publish_ticketed': 'basic',
  'domain.connect_custom': 'basic',
} as const

const PAID = new Set(['basic', 'pro'])

/**
 * Throws FORBIDDEN with a PlanRequiredError cause unless the org's effective
 * plan covers `gate`; SERVICE_UNAVAILABLE when the plan cannot be read.
 */
export async function requireOrgPlan(gate: keyof typeof GATES): Promise<void> {
  let plan: string
  try {
    const [host, jwt] = await Promise.all([requestHost(), identityJwt()])
    if (!host || !jwt) throw new Error('no host or identity session')
    plan = await orgPlanViaApi(host, jwt)
  } catch (cause) {
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Could not check your plan. Try again in a moment.',
      cause,
    })
  }
  if (PAID.has(plan)) return
  const requiredPlan = GATES[gate]
  const cause = new PlanRequiredError(requiredPlan)
  throw new TRPCError({ code: 'FORBIDDEN', message: cause.message, cause })
}
