// Billing phase 1 (#2129): the site's plan gates. The org's effective plan
// comes from the gateway (tenant-directory), read server-side as the
// signed-in organizer; nothing the client sends decides it. Fails closed:
// when the plan cannot be read, a gated action is refused as retryable.
import { TRPCError } from '@trpc/server'
import {
  identityJwt,
  orgContextViaApi,
  requestHost,
} from '@/lib/konf-api/conference-write'
import { KonfApiError, type RequiredPlan } from '@/lib/konf-api/client'

/** The plan a refused action needs; rides on the TRPCError cause. */
export class PlanRequiredError extends KonfApiError {
  constructor(
    requiredPlan: RequiredPlan,
    org: { orgId?: string; isOwner?: boolean } = {},
  ) {
    super(`This needs the ${requiredPlan} plan.`, {
      reason: 'PLAN_REQUIRED',
      requiredPlan,
      ...org,
    })
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
  let ctx: Awaited<ReturnType<typeof orgContextViaApi>>
  try {
    const [host, jwt] = await Promise.all([requestHost(), identityJwt()])
    if (!host || !jwt) throw new Error('no host or identity session')
    ctx = await orgContextViaApi(host, jwt)
  } catch (cause) {
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Could not check your plan. Try again in a moment.',
      cause,
    })
  }
  if (PAID.has(ctx.plan)) return
  const cause = new PlanRequiredError(GATES[gate], {
    orgId: ctx.orgId,
    isOwner: ctx.isOwner,
  })
  throw new TRPCError({ code: 'FORBIDDEN', message: cause.message, cause })
}
