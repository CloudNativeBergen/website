import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { z } from 'zod'
import {
  chargeProvisioningCreate,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  MIN_IDEMPOTENCY_KEY_LENGTH,
  SERVICE_ASSERTION_HEADER,
  verifyServiceAssertion,
} from '@/lib/provisioning'
import { provisionOrganization } from '@/lib/onboarding/provision'
import { CreateOrganizationSchema } from '@/server/schemas/onboarding'

/**
 * `POST /api/provisioning/service/organizations` — the gateway's
 * `createOrganization` (RunKonf/kontroll#79), relayed by tenant-directory.
 *
 * An AUTHENTICATION path into the same transaction as the bearer route next
 * door; no provisioning logic lives here. The caller proves itself with a
 * tenant-directory assertion over the exact body (`TENANT_DIRECTORY_PUBLIC_KEYS`,
 * see `@/lib/provisioning/service`); the operator check already ran in the
 * gateway and tenant-directory (`requirePlatform`). Unset keys refuse everyone.
 *
 *   body: { idempotencyKey, input: { name, slug, conferenceTitle, startDate,
 *           endDate, domain?, ownerEmail } }
 *   200 { organizationId, conferenceId, replayed }
 *   400 { error: "invalid_request", code }
 *   401 { error: "unauthorized" }
 *   409 { error: "conflict", code }
 *   500 { error: "internal_error" }
 */

const Body = z.object({
  idempotencyKey: z
    .string()
    .min(MIN_IDEMPOTENCY_KEY_LENGTH)
    .max(MAX_IDEMPOTENCY_KEY_LENGTH)
    .regex(/^[\x20-\x7e]+$/),
  input: z.object({
    name: z.string(),
    slug: z.string(),
    conferenceTitle: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    domain: z.string().nullish(),
    ownerEmail: z.string(),
  }),
})

const invalid = (code: string) =>
  NextResponse.json({ error: 'invalid_request', code }, { status: 400 })

export async function POST(request: NextRequest): Promise<NextResponse> {
  noStore()
  try {
    const raw = await request.text()
    const operatorId = await verifyServiceAssertion(
      request.headers.get(SERVICE_ASSERTION_HEADER),
      process.env.TENANT_DIRECTORY_PUBLIC_KEYS,
      raw,
    )
    if (!operatorId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      return invalid('invalid_json')
    }
    const body = Body.safeParse(json)
    if (!body.success) return invalid('schema_validation_failed')
    const { input, idempotencyKey } = body.data

    // The SAME schema as the wizard and the bearer route. The gateway input
    // has no city or country; the organizer fills them in from /admin.
    const parsed = CreateOrganizationSchema.safeParse({
      organization: {
        name: input.name,
        slug: input.slug,
        contactEmail: input.ownerEmail,
      },
      conference: {
        title: input.conferenceTitle,
        // ponytail: placeholder until the gateway input carries a location.
        city: 'TBD',
        country: 'TBD',
        startDate: input.startDate,
        endDate: input.endDate,
      },
      organizer: { name: input.ownerEmail, email: input.ownerEmail },
      domains: input.domain ? [input.domain] : [],
    })
    if (!parsed.success) return invalid('schema_validation_failed')

    if (!(await chargeProvisioningCreate())) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    const outcome = await provisionOrganization(parsed.data, {
      idempotencyKey,
      createdBy: operatorId,
    })
    if (!outcome.ok) {
      const { rejection } = outcome
      if (rejection.code === 'commit_failed') {
        console.error('[provisioning/service] commit failed', rejection.cause)
      } else {
        console.warn(`[provisioning/service] refused (${rejection.code})`)
      }
      return rejection.code === 'commit_failed' ||
        rejection.code === 'no_host_available'
        ? NextResponse.json({ error: 'internal_error' }, { status: 500 })
        : NextResponse.json(
            { error: 'conflict', code: rejection.code },
            { status: 409 },
          )
    }
    console.info(
      `[provisioning/service] ${outcome.replayed ? 'replayed' : 'created'} ${outcome.organizationId} by ${operatorId}`,
    )
    return NextResponse.json({
      organizationId: outcome.organizationId,
      conferenceId: outcome.conferenceId,
      replayed: outcome.replayed,
    })
  } catch (error) {
    console.error('[provisioning/service] unhandled error', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
