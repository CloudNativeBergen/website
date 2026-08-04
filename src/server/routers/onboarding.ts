import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'
import {
  getPlatformOrgId,
  isPlatformOperatorForOrg,
} from '@/lib/authz/platform'
import { DOMAIN_ALREADY_CLAIMED } from '@/lib/conference/domains'
import {
  findConflictingDomains,
  findSpeakersByEmail,
  isOrgSlugTaken,
  provisionOrganization,
  type ProvisionRejection,
} from '@/lib/onboarding/provision'
import {
  CreateOrganizationSchema,
  ValidateOnboardingSchema,
} from '../schemas/onboarding'

/** Message prefix when the organization slug is already taken. */
export const ORG_SLUG_ALREADY_TAKEN = 'Already used by another organization'

/** Message when the organizer email matches SEVERAL speaker accounts. */
export const AMBIGUOUS_ORGANIZER_EMAIL =
  'That email matches multiple speaker accounts — resolve the duplicates before onboarding this organizer'

/** Prefix when the address minted from the org slug is already claimed. The
 * slug itself is free, so the wizard must point at the ADDRESS, not the slug. */
export const PLATFORM_HOST_ALREADY_CLAIMED =
  'Another conference already claims the address this slug would get — choose a different slug'

/** Message when no address at all could be given to the new tenant. */
export const NO_TENANT_HOST_AVAILABLE =
  'This deployment mints no tenant subdomains (PLATFORM_DOMAIN_SUFFIX is unset), so the tenant would have no address — add a domain below'

/** Prefix when the slug would mint a hostname the platform keeps for itself. */
export const RESERVED_ORG_SLUG =
  'That slug is reserved by the platform — choose another'

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
 * Translate a shared-transaction rejection into this surface's error language.
 *
 * The tRPC caller is a signed-in platform operator staring at a wizard, so the
 * message NAMES the offending slug/domain. The machine API deliberately does
 * not reuse these strings — see `src/app/api/provisioning/organizations`.
 */
function toTRPCError(rejection: ProvisionRejection): TRPCError {
  switch (rejection.code) {
    case 'slug_taken':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: `${ORG_SLUG_ALREADY_TAKEN}: ${rejection.slug}`,
      })
    case 'domain_claimed':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: `${DOMAIN_ALREADY_CLAIMED}: ${rejection.domains.join(', ')}`,
      })
    case 'platform_host_taken':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: `${PLATFORM_HOST_ALREADY_CLAIMED}: ${rejection.host}`,
      })
    case 'reserved_slug':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: `${RESERVED_ORG_SLUG}: ${rejection.slug}`,
      })
    case 'no_host_available':
      // BAD_REQUEST rather than a 500: the operator can fix it from the form
      // they are looking at by attaching a domain, which is not true of the
      // machine caller (see the provisioning API's mapping).
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: NO_TENANT_HOST_AVAILABLE,
      })
    case 'ambiguous_organizer':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: AMBIGUOUS_ORGANIZER_EMAIL,
      })
    case 'commit_failed':
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create the organization',
        cause: rejection.cause,
      })
  }
}

/**
 * Onboarding S1 (RunKonf/platform#4) — the CONCIERGE tenant-creation API.
 * Platform-operator only; there is no public signup surface on this router.
 *
 * The machine-callable twin lives at `POST /api/provisioning/organizations`
 * (bearer secret, for RunKonf/kontroll). Both call the SAME transaction in
 * `@/lib/onboarding/provision` — only the authentication differs.
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
          : Promise.resolve(
              [] as Awaited<ReturnType<typeof findSpeakersByEmail>>,
            ),
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
   * membership for the named user, in ONE all-or-nothing Sanity transaction
   * (see `@/lib/onboarding/provision` for the full contract).
   *
   * No idempotency key: the wizard is an interactive, one-shot surface with a
   * human watching the result, and its own uniqueness preflight already covers
   * the double-submit case. Replay protection is a MACHINE-caller concern and
   * lives on the provisioning API.
   */
  createOrganization: platformProcedure
    .input(CreateOrganizationSchema)
    .mutation(async ({ input }) => {
      const outcome = await provisionOrganization(input)
      if (!outcome.ok) throw toTRPCError(outcome.rejection)

      // `ok`/`replayed` are transport details of the shared transaction: this
      // surface passes no idempotency key, so `replayed` is always false and
      // would only be noise in the wizard's response.
      return {
        organizationId: outcome.organizationId,
        conferenceId: outcome.conferenceId,
        speakerId: outcome.speakerId,
        speakerCreated: outcome.speakerCreated,
        organizerMatchedName: outcome.organizerMatchedName,
        challenges: outcome.challenges,
      }
    }),
})
