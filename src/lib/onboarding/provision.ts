import { createHash } from 'crypto'
import { revalidateTag } from 'next/cache'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { generateKey } from '@/lib/sanity/helpers'
import {
  normalizeDomain,
  wildcardFormForHost,
  domainEntriesOverlap,
} from '@/lib/conference/domains'
import {
  getDomainVerification,
  syncDomainVerifications,
  toDomainVerificationView,
  type DomainVerificationView,
} from '@/lib/domain-verification'
import {
  PROVISIONING_RECEIPT_RETENTION_DAYS,
  PROVISIONING_REQUEST_TYPE,
} from '@/lib/provisioning/constants'
import { buildOnboardingDocuments, type OnboardingInput } from './create'

/**
 * THE tenant-creation transaction — one implementation, two authenticated
 * front doors.
 *
 * `onboarding.createOrganization` (tRPC, platform-operator session) and
 * `POST /api/provisioning/organizations` (bearer secret, RunKonf/kontroll) both
 * land here. They differ ONLY in how the caller is authenticated; every
 * server-side authority below — global slug uniqueness, routing-overlap-aware
 * domain uniqueness, single-match organizer resolution, the all-or-nothing
 * write — is enforced once, here, for both.
 *
 * That single-implementation rule is load-bearing: a second copy would fork the
 * per-field document enumeration in `buildOnboardingDocuments` (#752) and start
 * silently dropping new conference fields on whichever path was forgotten.
 *
 * SERVER-SIDE AUTHORITY (the wizard and the control panel only mirror these):
 *   - org slug must be globally unique among organizations;
 *   - every domain must be globally unclaimed under the ROUTING matcher's
 *     semantics — exact OR single-label wildcard, in both directions
 *     ({@link findConflictingDomains}) — an overlap would silently steal
 *     another tenant's routing;
 *   - the organizer email must resolve to AT MOST one existing speaker; on
 *     several matches the duplicate accounts must be merged first — silently
 *     picking one risks binding the tenant to the wrong person.
 *
 * MEMBERSHIP MECHANICS: an existing speaker is PATCHED (org membership
 * appended) in the same transaction; a brand-new speaker document is created
 * carrying the membership, and the login flow auto-links the person's first
 * sign-in to it via verified-email intersection, then `organizerOrgIds`
 * (derived from `conference.organizers[]`) grants them /admin.
 *
 * DEFAULTS: visibility 'unlisted', registration closed, empty formats/topics,
 * comms emails funneled to the org contact address — see
 * `buildOnboardingDocuments`. NO plan/entitlement fields are set (the org
 * schema deliberately excludes billing until that issue lands).
 */

/** The subset of `requested` domains that would collide with an entry some
 * conference already claims — under the ROUTING matcher's semantics (exact OR
 * single-label wildcard, {@link domainEntriesOverlap}), NOT mere string
 * equality: requesting `sub.example.com` collides with an existing
 * `*.example.com` (the wildcard already serves that host), and requesting
 * `*.example.com` collides with an existing `sub.example.com` (the new
 * wildcard would capture the existing host). Either direction misroutes
 * traffic across tenants, so both are refused.
 *
 * BOUNDED: only conferences whose entries could possibly overlap are read
 * (the wizard's 400ms-debounced validateSetup calls this repeatedly) —
 *   - `$probes` catches entries EQUAL to a requested domain or to its wildcard
 *     form (an existing wildcard covering a requested host);
 *   - the `match` clauses PRUNE for existing hosts under a requested wildcard
 *     by suffix tokens (`*.example.com` → entries containing `example.com`'s
 *     tokens — a superset of the true conflicts, never a miss, since a
 *     conflicting `<label>.example.com` always carries every suffix token).
 * The GROQ only narrows; the shared JS predicate is the authority.
 */
export async function findConflictingDomains(
  requested: string[],
): Promise<string[]> {
  if (requested.length === 0) return []

  const probes = new Set<string>()
  const params: Record<string, unknown> = {}
  const clauses = ['@ in $probes']
  for (const domain of requested) {
    probes.add(domain)
    const wildcard = wildcardFormForHost(domain)
    if (wildcard) probes.add(wildcard)
    if (domain.startsWith('*.')) {
      const param = `base${clauses.length - 1}`
      params[param] = domain.slice(2)
      clauses.push(`@ match $${param}`)
    }
  }
  params.probes = [...probes]

  const candidates = await clientReadUncached.fetch<string[] | null>(
    // groq-global: domain uniqueness is a GLOBAL routing invariant across every tenant's conferences (same rule as SE-5 createEdition).
    `*[_type == "conference" && count(domains[${clauses.join(' || ')}]) > 0].domains[]`,
    params,
  )
  const claimed = (candidates ?? []).map(normalizeDomain)
  return requested.filter((r) =>
    claimed.some((entry) => domainEntriesOverlap(entry, r)),
  )
}

/** Whether an organization already claims this slug. */
export async function isOrgSlugTaken(slug: string): Promise<boolean> {
  const count = await clientReadUncached.fetch<number>(
    // groq-global: org slugs are a GLOBAL namespace (they identify tenants).
    `count(*[_type == "organization" && slug.current == $slug])`,
    { slug },
  )
  return (count ?? 0) > 0
}

export interface SpeakerMatch {
  _id: string
  name?: string
}

/**
 * Speakers whose stored VERIFIED match-set (display `email` or `knownEmails`,
 * both verified-owned — see `getOrCreateSpeaker`'s stored-side-verified
 * invariant) contains the given normalized email. Oldest-first, bounded, so the
 * caller can deterministically pick a single match and detect duplicates.
 */
export async function findSpeakersByEmail(
  email: string,
): Promise<SpeakerMatch[]> {
  const speakers = await clientReadUncached.fetch<SpeakerMatch[] | null>(
    // groq-global: identity is a global person — the named organizer may already exist as a speaker of any tenant's conference (#615).
    `*[_type == "speaker" && (lower(email) == $email || count((knownEmails[])[lower(@) == $email]) > 0)] | order(_createdAt asc) [0...5] { _id, name }`,
    { email },
  )
  return speakers ?? []
}

/**
 * IDEMPOTENCY RECEIPT id for a caller-supplied key.
 *
 * Salted with `AUTH_SECRET` for the same reason `storedTokenDocId` is: the id
 * is visible to anyone who can read the content lake, and an unsalted digest of
 * the key would let them confirm a guessed key (and, with it, replay a
 * provisioning request).
 */
function receiptDocId(idempotencyKey: string): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET is not set; provisioning cannot be idempotent')
  }
  const digest = createHash('sha256')
    .update(`konf.provisioning.receipt.v1|${idempotencyKey}|${secret}`)
    .digest('hex')
  return `${PROVISIONING_REQUEST_TYPE}.${digest}`
}

interface Receipt {
  organizationId: string
  conferenceId: string
  speakerId: string
  speakerCreated: boolean
  domains?: string[]
}

async function readReceipt(id: string): Promise<Receipt | null> {
  return clientReadUncached.fetch<Receipt | null>(
    // groq-global: platform-internal provisioning receipt, deliberately not tenant-scoped (it predates any tenant).
    `*[_type == $type && _id == $id][0]{ organizationId, conferenceId, speakerId, speakerCreated, domains }`,
    { type: PROVISIONING_REQUEST_TYPE, id },
    { cache: 'no-store' },
  )
}

export type ProvisionRejection =
  | { code: 'slug_taken'; slug: string }
  | { code: 'domain_claimed'; domains: string[] }
  | { code: 'ambiguous_organizer' }
  | { code: 'commit_failed'; cause: unknown }

export interface ProvisionResult {
  organizationId: string
  conferenceId: string
  speakerId: string
  speakerCreated: boolean
  /** Name of the pre-existing speaker the organizer email matched, if any.
   * Only meaningful on a FRESH provision — a replay does not re-resolve it. */
  organizerMatchedName: string | null
  challenges: DomainVerificationView[]
  /** True when an earlier request carrying the same idempotency key already
   * created this tenant and nothing new was written. */
  replayed: boolean
}

export type ProvisionOutcome =
  | ({ ok: true } & ProvisionResult)
  | { ok: false; rejection: ProvisionRejection }

/** Mint a PENDING verification record per claimed domain (#683) and project the
 * challenge the caller has to publish. Best-effort by construction: the tenant
 * is already committed, and a missing record fails closed (never routed under
 * enforcement, never allowlisted). Re-running on a replay is harmless and
 * repairs a first attempt that died between commit and sync. */
async function mintChallenges(
  conferenceId: string,
  domains: string[],
): Promise<DomainVerificationView[]> {
  await syncDomainVerifications(conferenceId, domains)
  return Promise.all(
    domains.map(async (hostname) =>
      toDomainVerificationView(hostname, await getDomainVerification(hostname)),
    ),
  )
}

/**
 * Create a NEW TENANT: organization + first conference + organizer membership
 * for the named user — ALL-OR-NOTHING in one Sanity transaction (a failure
 * writes NOTHING; the caller simply re-runs).
 *
 * REPLAY PROTECTION (`idempotencyKey`, used by the machine API; the operator
 * wizard passes none): a `provisioningRequest` receipt keyed by
 * `sha256(key + AUTH_SECRET)` is created INSIDE the same transaction. Sanity's
 * `create` on an explicit id fails if the document exists, and the transaction
 * is atomic — so a second request carrying the same key cannot commit an
 * organization, no matter how the two interleave. That is a genuine
 * compare-and-swap, not a read-then-write check: the pre-flight receipt read
 * below is only a fast path, and the atomic create is the actual guarantee.
 *
 * The receipt is what makes the retry SAFE rather than merely refused — a
 * timed-out caller that retries gets the original ids back, so a lost response
 * never strands a tenant the control panel does not know about.
 */
export async function provisionOrganization(
  input: OnboardingInput,
  options: { idempotencyKey?: string } = {},
): Promise<ProvisionOutcome> {
  const receiptId = options.idempotencyKey
    ? receiptDocId(options.idempotencyKey)
    : null

  if (receiptId) {
    const existing = await readReceipt(receiptId)
    if (existing?.organizationId) {
      return {
        ok: true,
        ...existing,
        organizerMatchedName: null,
        challenges: await mintChallenges(
          existing.conferenceId,
          existing.domains ?? [],
        ),
        replayed: true,
      }
    }
  }

  const [slugTaken, taken, speakerMatches] = await Promise.all([
    isOrgSlugTaken(input.organization.slug),
    // Overlap-aware (exact OR wildcard, both directions) and SKIPPED outright
    // for a domainless tenant — that path must not depend on a global read it
    // doesn't need.
    findConflictingDomains(input.domains),
    findSpeakersByEmail(input.organizer.email),
  ])

  if (slugTaken) {
    return {
      ok: false,
      rejection: { code: 'slug_taken', slug: input.organization.slug },
    }
  }
  if (taken.length > 0) {
    return { ok: false, rejection: { code: 'domain_claimed', domains: taken } }
  }
  if (speakerMatches.length > 1) {
    return { ok: false, rejection: { code: 'ambiguous_organizer' } }
  }
  const existingSpeaker = speakerMatches[0] ?? null

  const { organization, conference, speaker } = buildOnboardingDocuments(
    input,
    {
      organizationId: generateKey('organization'),
      conferenceId: generateKey('conference'),
      speakerId: generateKey('speaker'),
      mintKey: () => generateKey('key'),
    },
    existingSpeaker?._id ?? null,
  )
  const speakerId = speaker?._id ?? existingSpeaker!._id

  try {
    let tx = clientWrite.transaction().create(organization).create(conference)
    if (speaker) {
      tx = tx.create(speaker)
    } else if (existingSpeaker) {
      // The org is brand-new, so the membership cannot already exist — an
      // unconditional append is safe and stays inside the transaction.
      tx = tx.patch(existingSpeaker._id, (p) =>
        p
          .setIfMissing({ organizations: [] })
          .insert('after', 'organizations[-1]', [
            {
              _type: 'reference',
              _ref: organization._id,
              _key: organization._id,
            },
          ]),
      )
    }
    if (receiptId) {
      const now = Date.now()
      tx = tx.create({
        _id: receiptId,
        _type: PROVISIONING_REQUEST_TYPE,
        organizationId: organization._id,
        conferenceId: conference._id,
        speakerId,
        speakerCreated: speaker !== null,
        domains: input.domains,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(
          now + PROVISIONING_RECEIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
    }
    await tx.commit()
  } catch (error) {
    // A LOST RACE looks exactly like a failure here: the concurrent twin
    // committed the receipt first, so this transaction was rejected in full and
    // wrote nothing. Re-read the receipt — if it now exists, the tenant was
    // created once and this caller gets those ids, not a second organization.
    if (receiptId) {
      const winner = await readReceipt(receiptId).catch(() => null)
      if (winner?.organizationId) {
        return {
          ok: true,
          ...winner,
          organizerMatchedName: null,
          challenges: await mintChallenges(
            winner.conferenceId,
            winner.domains ?? [],
          ),
          replayed: true,
        }
      }
    }
    return { ok: false, rejection: { code: 'commit_failed', cause: error } }
  }

  const challenges = await mintChallenges(conference._id, input.domains)

  // A new conference document exists; bust the shared conferences tag so domain
  // resolution can see it once its domain actually routes here.
  revalidateTag('content:conferences', 'default')

  return {
    ok: true,
    organizationId: organization._id,
    conferenceId: conference._id,
    speakerId,
    speakerCreated: speaker !== null,
    organizerMatchedName: existingSpeaker?.name ?? null,
    challenges,
    replayed: false,
  }
}

/** Delete provisioning receipts whose retention window has elapsed. */
export async function deleteExpiredProvisioningReceipts(
  now: number = Date.now(),
): Promise<{ deleted: number }> {
  try {
    const result = await clientWrite.delete({
      // groq-global: platform-internal provisioning receipt, deliberately not tenant-scoped.
      query: `*[_type == $type && expiresAt < $now]`,
      params: {
        type: PROVISIONING_REQUEST_TYPE,
        now: new Date(now).toISOString(),
      },
    })
    return { deleted: result?.results?.length ?? 0 }
  } catch (error) {
    console.error('[provisioning] failed to clean up receipts', error)
    return { deleted: 0 }
  }
}
