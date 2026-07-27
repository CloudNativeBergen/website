import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { router, protectedProcedure } from '../trpc'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { generateKey } from '@/lib/sanity/helpers'
import {
  getPlatformOrgId,
  isPlatformOperatorForOrg,
} from '@/lib/authz/platform'
import { normalizeDomain } from '@/lib/conference/domains'
import { buildOnboardingDocuments } from '@/lib/onboarding/create'
import {
  CreateOrganizationSchema,
  ValidateOnboardingSchema,
} from '../schemas/onboarding'
import { DOMAIN_ALREADY_CLAIMED } from './conference'

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

/** Every domain claimed by ANY conference, normalized (global uniqueness). */
async function fetchClaimedDomains(): Promise<Set<string>> {
  const all = await clientReadUncached.fetch<string[] | null>(
    // groq-global: domain uniqueness is a GLOBAL routing invariant across every tenant's conferences (same rule as SE-5 createEdition).
    `*[_type == "conference" && defined(domains)].domains[]`,
    {},
  )
  return new Set((all ?? []).map(normalizeDomain))
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
      const [slugTaken, claimed, matches] = await Promise.all([
        input.slug ? isOrgSlugTaken(input.slug) : Promise.resolve(false),
        input.domains && input.domains.length > 0
          ? fetchClaimedDomains()
          : Promise.resolve(new Set<string>()),
        input.organizerEmail
          ? findSpeakersByEmail(input.organizerEmail)
          : Promise.resolve([] as SpeakerMatch[]),
      ])

      const taken = (input.domains ?? []).filter((d) => claimed.has(d))

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
   *   - every domain must be globally unclaimed (same rule as SE-5 — a
   *     duplicate would silently steal another tenant's routing);
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
      const [slugTaken, claimedDomains, speakerMatches] = await Promise.all([
        isOrgSlugTaken(input.organization.slug),
        fetchClaimedDomains(),
        findSpeakersByEmail(input.organizer.email),
      ])

      if (slugTaken) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${ORG_SLUG_ALREADY_TAKEN}: ${input.organization.slug}`,
        })
      }

      const taken = input.domains.filter((d) => claimedDomains.has(d))
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

      // A new conference document exists; bust the shared conferences tag so
      // domain resolution can see it once its domain actually routes here.
      revalidateTag('content:conferences', 'default')

      return {
        organizationId: organization._id,
        conferenceId: conference._id,
        speakerId: speaker?._id ?? existingSpeaker!._id,
        speakerCreated: speaker !== null,
        organizerMatchedName: existingSpeaker?.name ?? null,
      }
    }),
})
