import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  chargeProvisioningCreate,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  MIN_IDEMPOTENCY_KEY_LENGTH,
  SERVICE_ASSERTION_HEADER,
  verifyServiceAssertion,
} from '@/lib/provisioning'
import { receiptDocId } from '@/lib/onboarding/provision'
import { clientReadUncached } from '@/lib/sanity/client'
import { CLONE_FAMILIES } from '@/lib/conference/edition'
import { DOMAIN_ALREADY_CLAIMED } from '@/lib/conference/domains'
import { createEditionFromSource } from '@/server/routers/conference'

/**
 * `POST /api/provisioning/service/conferences` — the gateway's
 * `provisionConference` (RunKonf/kontroll#85), relayed by tenant-directory
 * under the same body-bound assertion as `../organizations`. Who may create
 * an edition of `orgId` was decided in tenant-directory; this route only
 * proves the caller and keeps `copyFrom` inside `orgId`.
 *
 *   body: { idempotencyKey, orgId, input: { title, startDate, endDate,
 *           domain?, copyFrom? } }
 *   200 { conferenceId, domains, replayed }
 *   400 { error: "invalid_request", code }
 *   401 { error: "unauthorized" }
 *   409 { error: "conflict", code }  domain_claimed | idempotency_conflict
 *                                    | copy_from_not_in_org
 *   500 { error: "internal_error" }
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Body = z.object({
  idempotencyKey: z
    .string()
    .min(MIN_IDEMPOTENCY_KEY_LENGTH)
    .max(MAX_IDEMPOTENCY_KEY_LENGTH)
    .regex(/^[\x20-\x7e]+$/),
  orgId: z.string().min(1).max(128),
  input: z
    .object({
      title: z.string().trim().min(1).max(200),
      startDate: day,
      endDate: day,
      domain: z.string().max(253).nullish(),
      copyFrom: z.string().max(128).nullish(),
    })
    .refine((i) => i.endDate >= i.startDate),
})

const reply = (status: number, error: string, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status })

export async function POST(request: NextRequest): Promise<NextResponse> {
  noStore()
  try {
    const raw = await request.text()
    const operatorId = await verifyServiceAssertion(
      request.headers.get(SERVICE_ASSERTION_HEADER),
      process.env.TENANT_DIRECTORY_PUBLIC_KEYS,
      raw,
    )
    if (!operatorId) return reply(401, 'unauthorized')

    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      return reply(400, 'invalid_request', 'invalid_json')
    }
    const body = Body.safeParse(json)
    if (!body.success)
      return reply(400, 'invalid_request', 'schema_validation_failed')
    const { idempotencyKey, orgId, input } = body.data

    // The source edition, always one of orgId's own published conferences:
    // copyFrom when given, else the org's latest (identity only).
    const sourceId = await clientReadUncached.fetch<string | null>(
      input.copyFrom
        ? // groq-global-scoped: copyFrom is checked against the server-supplied orgId in the same filter.
          `*[_type == "conference" && _id == $copyFrom && organization._ref == $orgId && !(_id in path("drafts.**"))][0]._id`
        : // groq-global-scoped: filtered by the server-supplied orgId.
          `*[_type == "conference" && organization._ref == $orgId && !(_id in path("drafts.**"))] | order(startDate desc)[0]._id`,
      { orgId, copyFrom: input.copyFrom ?? null },
    )
    if (!sourceId) {
      return input.copyFrom
        ? reply(409, 'conflict', 'copy_from_not_in_org')
        : reply(400, 'invalid_request', 'no_source_edition')
    }

    if (!(await chargeProvisioningCreate())) return reply(429, 'rate_limited')

    const clone = Boolean(input.copyFrom)
    try {
      const out = await createEditionFromSource(
        sourceId,
        {
          title: input.title,
          startDate: input.startDate,
          endDate: input.endDate,
          domains: input.domain ? [input.domain] : [],
          clone: Object.fromEntries(
            CLONE_FAMILIES.map((f) => [f, clone]),
          ) as Record<(typeof CLONE_FAMILIES)[number], boolean>,
        },
        {
          id: receiptDocId(idempotencyKey, 'edition'),
          organizationId: orgId,
          createdBy: operatorId,
          inputHash: createHash('sha256')
            .update(JSON.stringify([orgId, input, operatorId]))
            .digest('hex'),
        },
      )
      console.info(
        `[provisioning/service] ${out.replayed ? 'replayed' : 'created'} edition ${out.conferenceId} of ${orgId} by ${operatorId}`,
      )
      return NextResponse.json({
        conferenceId: out.conferenceId,
        domains: out.domains ?? [],
        replayed: Boolean(out.replayed),
      })
    } catch (error) {
      if (!(error instanceof TRPCError)) throw error
      if (error.code === 'CONFLICT')
        return reply(409, 'conflict', 'idempotency_conflict')
      if (error.code === 'BAD_REQUEST')
        return error.message.startsWith(DOMAIN_ALREADY_CLAIMED)
          ? reply(409, 'conflict', 'domain_claimed')
          : reply(400, 'invalid_request', 'domain_not_allowed')
      throw error
    }
  } catch (error) {
    console.error('[provisioning/service] unhandled error', error)
    return reply(500, 'internal_error')
  }
}
