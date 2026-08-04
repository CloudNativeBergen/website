import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { router, protectedProcedure } from '../trpc'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { generateKey } from '@/lib/sanity/helpers'
import {
  getPlatformOrgId,
  isPlatformOperatorForOrg,
} from '@/lib/authz/platform'
import {
  DOMAIN_ALREADY_CLAIMED,
  normalizeDomain,
  wildcardFormForHost,
  domainEntriesOverlap,
} from '@/lib/conference/domains'
import {
  getDomainVerification,
  syncDomainVerifications,
  toDomainVerificationView,
} from '@/lib/domain-verification'
import { buildOnboardingDocuments } from '@/lib/onboarding/create'
import {
  CreateOrganizationSchema,
  ValidateOnboardingSchema,
} from '../schemas/onboarding'

/** Message prefix when the organization slug is already taken. */
export const ORG_SLUG_ALREADY_TAKEN = 'Already used by another organization'

/** Message when the organizer email matches SEVERAL speaker accounts. */
export const AMBIGUOUS_ORGANIZER_EMAIL =
  'That email matches multiple speaker accounts — resolve the duplicates before onboarding this organizer'

/**
 * PLATFORM-OPERATOR gate (onboarding S1). Layered on `protectedProcedure`
 * (authentication) exactly like `requireAdmin` layers the tenant waist — but
 * the org checked is the CONFIGURED platform org (`PLATFORM_ORG_SLUG`), never
 * the request domain's: tenant creation is cross-tenant by nature and must not
 * be reachable by an arbitrary tenant's organizers. STRICT check, fail closed
 * (see `@/lib/authz/platform`).
 */
const platformProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const platformOrgId = await getPlatformOrgId()
  if (!isPlatformOperatorForOrg(ctx.session?.speaker, platformOrgId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Platform operator privileges required',
    })
  }
  return next({ ctx: { ...ctx, platformOrgId: platformOrgId! } })
})

/**
 * The subset of `requested` domains that would collide with an entry some
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
async function findConflictingDomains(requested: string[]): Promise<string[]> {
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
async function isOrgSlugTaken(slug: string): Promise<boolean> {
  const count = await clientReadUncached.fetch<number>(
    // groq-global: org slugs are a GLOBAL namespace (they identify tenants).
    `count(*[_type == "organization" && slug.current == $slug])`,
    { slug },
  )
  return (count ?? 0) > 0
}

interface SpeakerMatch {
  _id: string
  name?: string
}

/**
 * Speakers whose stored VERIFIED match-set (display `email` or `knownEmails`,
 * both verified-owned — see `getOrCreateSpeaker`'s stored-side-verified
 * invariant) contains the given normalized email. Oldest-first, bounded, so the
 * caller can deterministically pick a single match and detect duplicates.
 */
async function findSpeakersByEmail(email: string): Promise<SpeakerMatch[]> {
  const speakers = await clientReadUncached.fetch<SpeakerMatch[] | null>(
    // groq-global: identity is a global person — the named organizer may already exist as a speaker of any tenant's conference (#615).
    `*[_type == "speaker" && (lower(email) == $email || count((knownEmails[])[lower(@) == $email]) > 0)] | order(_createdAt asc) [0...5] { _id, name }`,
    { email },
  )
  return speakers ?? []
}

/**
 * Onboarding S1 (RunKonf/platform#4) — the CONCIERGE tenant-creation API.
 * Platform-operator only; there is no public signup surface.
 */
export const onboardingRouter = router({
  /**
   * Preflight probe for the wizard's inline feedback: org-slug availability,
   * globally-claimed domains among the typed ones, and whether the organizer
   * email resolves to an existing speaker account (or ambiguously to several).
   * Read-only.
   */
  validateSetup: platformProcedure
    .input(ValidateOnboardingSchema)
    .query(async ({ input }) => {
      const [slugTaken, taken, matches] = await Promise.all([
        input.slug ? isOrgSlugTaken(input.slug) : Promise.resolve(false),
        // Skips the read entirely for an empty list (returns []).
        findConflictingDomains(input.domains ?? []),
        input.organizerEmail
          ? findSpeakersByEmail(input.organizerEmail)
          : Promise.resolve([] as SpeakerMatch[]),
      ])

      return {
        slugTaken,
        takenDomains: taken,
        organizer: {
          matchCount: matches.length,
          // Only the unambiguous single match is surfaced by name.
          match:
            matches.length === 1 ? { name: matches[0].name ?? null } : null,
        },
      }
    }),

  /**
   * Create a NEW TENANT: organization + first conference + organizer
   * membership for the named user — ALL-OR-NOTHING in one Sanity transaction
   * (a failure writes NOTHING; the wizard is simply re-runnable).
   *
   * SERVER-SIDE AUTHORITY (the wizard only mirrors these):
   *   - org slug must be globally unique among organizations;
   *   - every domain must be globally unclaimed under the ROUTING matcher's
   *     semantics — exact OR single-label wildcard, in both directions
   *     ({@link findConflictingDomains}) — an overlap would silently steal
   *     another tenant's routing;
   *   - the organizer email must resolve to AT MOST one existing speaker; on
   *     several matches the duplicate accounts must be merged first
   *     (BAD_REQUEST) — silently picking one risks binding the tenant to the
   *     wrong person.
   *
   * MEMBERSHIP MECHANICS: an existing speaker is PATCHED (org membership
   * appended) in the same transaction; a brand-new speaker document is created
   * carrying the membership, and the login flow auto-links the person's first
   * sign-in to it via verified-email intersection, then `organizerOrgIds`
   * (derived from `conference.organizers[]`) grants them /admin.
   *
   * DEFAULTS: visibility 'unlisted', registration closed, empty formats/
   * topics, comms emails funneled to the org contact address — see
   * `buildOnboardingDocuments`. NO plan/entitlement fields are set (the org
   * schema deliberately excludes billing until that issue lands).
   */
  createOrganization: platformProcedure
    .input(CreateOrganizationSchema)
    .mutation(async ({ input }) => {
      const [slugTaken, taken, speakerMatches] = await Promise.all([
        isOrgSlugTaken(input.organization.slug),
        // Overlap-aware (exact OR wildcard, both directions) and SKIPPED
        // outright for a domainless tenant — that path must not depend on a
        // global read it doesn't need.
        findConflictingDomains(input.domains),
        findSpeakersByEmail(input.organizer.email),
      ])

      if (slugTaken) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${ORG_SLUG_ALREADY_TAKEN}: ${input.organization.slug}`,
        })
      }

      if (taken.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${DOMAIN_ALREADY_CLAIMED}: ${taken.join(', ')}`,
        })
      }

      if (speakerMatches.length > 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: AMBIGUOUS_ORGANIZER_EMAIL,
        })
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

      try {
        let tx = clientWrite
          .transaction()
          .create(organization)
          .create(conference)
        if (speaker) {
          tx = tx.create(speaker)
        } else if (existingSpeaker) {
          // The org is brand-new, so the membership cannot already exist —
          // an unconditional append is safe and stays inside the transaction.
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
        await tx.commit()
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create the organization',
          cause: error,
        })
      }

      // Mint a PENDING verification record per claimed domain (#683) so the
      // hand-off screen can hand the operator the exact TXT record to publish.
      // Best-effort: the tenant is already committed, and a missing record fails
      // closed (never routed under enforcement, never allowlisted).
      await syncDomainVerifications(conference._id, input.domains)
      const challenges = await Promise.all(
        input.domains.map(async (hostname) =>
          toDomainVerificationView(
            hostname,
            await getDomainVerification(hostname),
          ),
        ),
      )

      // A new conference document exists; bust the shared conferences tag so
      // domain resolution can see it once its domain actually routes here.
      revalidateTag('content:conferences', 'default')

      return {
        organizationId: organization._id,
        conferenceId: conference._id,
        speakerId: speaker?._id ?? existingSpeaker!._id,
        speakerCreated: speaker !== null,
        organizerMatchedName: existingSpeaker?.name ?? null,
        challenges,
      }
    }),
})
