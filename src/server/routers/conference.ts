import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import { headers } from 'next/headers'
import {
  router,
  adminProcedure,
  requireFeatureNotDenied,
  resolveConferenceId,
} from '../trpc'
import {
  requireDocumentsInCurrentOrg,
  requireSpeakersInCurrentOrg,
} from '../tenancy'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import {
  getPublicTicketTypes,
  getLowestTicketPrice,
  getTicketAvailability,
  type TicketAvailability,
} from '@/lib/tickets/public'
import { hasTicketingBinding, ticketingBinding } from '@/lib/tickets/provider'
import {
  ensureArrayKeys,
  ensureUniqueArrayKeys,
  createReferenceWithKey,
  generateKey,
} from '@/lib/sanity/helpers'
import { clearConferenceTeamsCache } from '@/lib/teams'
import {
  CANNOT_REMOVE_CURRENT_DOMAIN,
  DOMAIN_ALREADY_CLAIMED,
  domainEntriesOverlap,
  domainsWouldStrandHost,
  normalizeDomain,
} from '@/lib/conference/domains'
import {
  findUnallocatedPlatformDomains,
  PLATFORM_DOMAIN_NOT_ALLOCATED,
  syncDomainVerifications,
} from '@/lib/domain-verification'
import { planEditionPlatformHosts } from '@/lib/conference/platformEditionHosts'
import {
  buildEditionDocuments,
  type SourceConference,
  type SourceSponsorTier,
  type SourceContractTemplate,
} from '@/lib/conference/edition'
import {
  UpdateBasicInfoSchema,
  UpdateVisibilitySchema,
  UpdateLifecycleStatusSchema,
  UpdateVenueSchema,
  UpdateBrandingSchema,
  UpdateDatesSchema,
  UpdateRegistrationSchema,
  UpdateCommunicationSchema,
  UpdateTicketingIdsSchema,
  UpdateAnalyticsSchema,
  UpdateLocalInfoSchema,
  UpdateCfpGoalsSchema,
  UpdateSocialLinksSchema,
  UpdateVanityMetricsSchema,
  UpdateSponsorBenefitsSchema,
  UpdateSponsorshipCustomizationSchema,
  UpdateDomainsSchema,
  UpdateOrganizersSchema,
  UpdateTopicsSchema,
  UpdateFormatsSchema,
  UpdateTeamsSchema,
  UpdateAnnouncementSchema,
  UpdateBrandingLogoSchema,
  SanitizeSvgPreviewSchema,
  CreateEditionSchema,
  ValidateNewDomainsSchema,
  UpdateHomepageSectionsSchema,
} from '../schemas/conference'
import {
  sanitizeSvgUpload,
  sanitizeSvgFieldOrThrow,
  SvgSanitizeError,
} from '@/lib/svg/upload'
import { defaultVariant } from '@/lib/homepage/variants'

/** The message the self-lockout guard rejects a self-removal with. */
export const CANNOT_REMOVE_SELF_ORGANIZER =
  'You cannot remove yourself from the organizer team'

/**
 * Both id forms a Sanity conference document can appear under — the published id
 * and its `drafts.` counterpart. Self-exclusion must drop BOTH, otherwise a
 * conference that also has a draft would collide with its own draft's copy of
 * the same `domains[]` and every domain edit would be rejected.
 */
function conferenceIdVariants(conferenceId: string): string[] {
  const published = conferenceId.replace(/^drafts\./, '')
  return [published, `drafts.${published}`]
}

/** The message a ticketing-binding collision is rejected with. */
export const TICKETING_BINDING_ALREADY_CLAIMED =
  'Another conference is already bound to that ticketing event'

/**
 * TICKETING IDS ARE A TENANCY ANCHOR, NOT A SETTING (#730/#731).
 *
 * `tickets.*` derives the Checkin event it acts on from THIS conference's
 * `checkinEventId` (`requireCheckinEventId`), and the ticket-sold webhook
 * resolves a conference FROM that id. Both providers authenticate with ONE
 * process-wide credential pair shared by every tenant
 * (`platformCheckinCredentials` / `platformTitoCredentials`), so a conference
 * that claims another tenant's event id inherits their sale: 100%-off discount
 * codes minted on it, their live codes deleted, their customers' payment
 * details readable, and their signature-verified ticket webhooks delivered to
 * the wrong conference.
 *
 * That makes the binding a GLOBAL-uniqueness claim in exactly the sense
 * `domains[]` already is, and it gets the same rule: an id another conference
 * document already claims is refused BAD_REQUEST before anything is written.
 *
 * SELF-EXCLUSION, like {@link fetchClaimedDomains}: this conference and its
 * `drafts.` twin are dropped, so re-saving an unchanged binding still succeeds.
 *
 * This is a claim check, not proof of ownership at the provider — it stops one
 * tenant from taking another's *already-bound* event, which is the reachable
 * attack. Verifying an unclaimed event id against the account that owns it needs
 * a provider round-trip and is tracked separately.
 */
async function ticketingBindingIsClaimed(
  excludeConferenceId: string,
  binding: {
    checkinEventId?: number | null
    titoAccountSlug?: string | null
    titoEventSlug?: string | null
  },
): Promise<boolean> {
  const excludeIds = conferenceIdVariants(excludeConferenceId)
  const checkinEventId = binding.checkinEventId ?? null
  const titoAccountSlug = binding.titoAccountSlug?.trim() || null
  const titoEventSlug = binding.titoEventSlug?.trim() || null
  if (checkinEventId === null && (!titoAccountSlug || !titoEventSlug)) {
    return false
  }
  // groq-global: a ticketing binding is a GLOBAL claim on one shared provider
  // account, so the collision set is every tenant's conferences (same rule as
  // `fetchClaimedDomains`).
  const query = `count(*[_type == "conference" && !(_id in $excludeIds) && (
      (defined($checkinEventId) && checkinEventId == $checkinEventId)
      || (defined($titoEventSlug) && titoAccountSlug == $titoAccountSlug && titoEventSlug == $titoEventSlug)
    )])`
  // FAIL CLOSED: an unreadable collision probe must not authorize the claim.
  const claimed = await clientReadUncached.fetch<number | null>(query, {
    excludeIds,
    checkinEventId,
    titoAccountSlug,
    titoEventSlug,
  })
  return (claimed ?? 1) > 0
}

/**
 * Every domain claimed by ANY conference document, normalized and deduped (two
 * conferences may spell the same host differently, or one may repeat it). Drives the
 * wizard's GLOBAL-uniqueness rule: a new edition must never shadow an existing
 * edition's routing (`getConferenceForDomain` picks the FIRST conference whose
 * `domains[]` matches the host — a duplicate would silently steal traffic).
 *
 * SELF-EXCLUSION: `excludeConferenceId` drops the document under edit (and its
 * draft) from the claimed set. The create paths claim domains no document owns
 * yet and pass nothing; `updateDomains` MUST pass its own id, or re-saving a
 * conference's unchanged `domains[]` would collide with itself and brick every
 * domain edit.
 */
async function fetchClaimedDomains(
  excludeConferenceId?: string,
): Promise<string[]> {
  const excludeIds = excludeConferenceId
    ? conferenceIdVariants(excludeConferenceId)
    : []
  // The exclusion predicate is appended ONLY when there is something to
  // exclude, so the create paths keep running the exact query they always have
  // — an `_id in []` term is never introduced where it could only ever widen
  // the risk of the claimed set coming back empty (which would fail OPEN).
  const query =
    excludeIds.length > 0
      ? // groq-global: domain uniqueness is a GLOBAL routing invariant across every tenant's conferences (same rule as onboarding's createOrganization).
        `*[_type == "conference" && defined(domains) && !(_id in $excludeIds)].domains[]`
      : // groq-global: domain uniqueness is a GLOBAL routing invariant across every tenant's conferences (same rule as onboarding's createOrganization).
        `*[_type == "conference" && defined(domains)].domains[]`
  const all = await clientReadUncached.fetch<string[] | null>(query, {
    excludeIds,
  })
  return Array.from(new Set((all ?? []).map(normalizeDomain)))
}

/**
 * The subset of `requested` entries that collide with an already-claimed one
 * under the ROUTING matcher's semantics (exact OR single-label wildcard, see
 * {@link domainEntriesOverlap}) — NOT mere string equality, which would let a
 * new edition claim `2026.cnb.no` while another tenant's `*.cnb.no` already
 * routes that host (or claim `*.cnb.no` and capture that tenant's existing
 * exact hosts). Either direction misroutes traffic across tenants, so both are
 * refused. Same predicate the onboarding path uses, so the two agree.
 */
function findClaimedOverlaps(
  requested: readonly string[],
  claimed: readonly string[],
): string[] {
  return requested.filter((r) =>
    claimed.some((entry) => domainEntriesOverlap(entry, r)),
  )
}

/**
 * Field-scoped conference settings mutations (SE-1a).
 *
 * INVARIANT: every mutation resolves the conference id from the request domain
 * via {@link resolveConferenceId} (NEVER from client input) and patches ONLY the
 * fields of its own fieldset — following the tickets router precedent. A
 * whole-document replace is never performed.
 *
 * UNSET SEMANTICS: within a validated input, `undefined` leaves a field
 * untouched, whereas an explicit `null` unsets it. {@link applyConferencePatch}
 * routes provided-non-null values through Sanity `.set()` and nulls through
 * `.unset()`.
 */
async function applyConferencePatch(
  conferenceId: string,
  input: Record<string, unknown>,
  opts: {
    /**
     * When set, each input key is patched as a dot path under this parent
     * object (`<pathPrefix>.<key>`) and the parent is `setIfMissing`-ed first.
     * Used by object fieldsets (e.g. `sponsorshipCustomization`) so a save only
     * touches the subfields it knows about and never clobbers siblings.
     */
    pathPrefix?: string
  } = {},
) {
  const { pathPrefix } = opts
  const set: Record<string, unknown> = {}
  const unset: string[] = []

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    const path = pathPrefix ? `${pathPrefix}.${key}` : key
    if (value === null) {
      unset.push(path)
    } else {
      set[path] = value
    }
  }

  if (Object.keys(set).length === 0 && unset.length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'No updates provided',
    })
  }

  try {
    let patch = clientWrite.patch(conferenceId)
    if (pathPrefix) patch = patch.setIfMissing({ [pathPrefix]: {} })
    if (Object.keys(set).length > 0) patch = patch.set(set)
    if (unset.length > 0) patch = patch.unset(unset)
    const result = await patch.commit()

    // Bust the cached conference read so the server-rendered settings page (and
    // every other `getConferenceForCurrentDomain` consumer) reflects the change.
    // Settings belong to ONE conference, so revalidate the tenant-scoped tag
    // only — `fetchConferenceData` and every public page tag this conference's
    // cached reads with `sanity:conference-<id>`, so other tenants stay warm.
    revalidateTag(conferenceTag(conferenceId), 'default')

    return { success: true, updated: result }
  } catch (error) {
    if (error instanceof TRPCError) throw error
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to update conference settings',
      cause: error,
    })
  }
}

export const conferenceRouter = router({
  updateBasicInfo: adminProcedure
    .input(UpdateBasicInfoSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  /**
   * Flip the conference's discovery visibility (M0 trial state). Field-scoped
   * like every other settings mutation: resolves the conference id from the
   * request domain (never the client) and patches ONLY `visibility`. The shared
   * `applyConferencePatch` revalidates this conference's scoped cache tag, so
   * the public sitemap/robots/metadata reflect the flip on the next request.
   */
  updateVisibility: adminProcedure
    .input(UpdateVisibilitySchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  /**
   * Set or clear the homepage lifecycle OVERRIDE (cancelled / archived).
   *
   * Deliberately its own mutation rather than a field on `updateBasicInfo`:
   * cancelling an event REPLACES the public homepage, so it must be an explicit,
   * auditable action and not a side effect of editing the tagline. Passing
   * `lifecycleStatus: null` clears the override and hands the page back to
   * date-derived behaviour.
   */
  updateLifecycleStatus: adminProcedure
    .input(UpdateLifecycleStatusSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  updateVenue: adminProcedure
    .input(UpdateVenueSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  updateBranding: adminProcedure
    .input(UpdateBrandingSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  updateDates: adminProcedure
    .input(UpdateDatesSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  updateRegistration: adminProcedure
    .input(UpdateRegistrationSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  updateCommunication: adminProcedure
    .input(UpdateCommunicationSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  /**
   * SAFEGUARDED. See {@link ticketingBindingIsClaimed}: these ids are the tenancy
   * anchor every `tickets.*` procedure derives its provider event from, and the
   * provider credential is shared platform-wide, so an unguarded write here
   * hands the caller another tenant's ticket sale. The check runs on the
   * EFFECTIVE binding (stored fields with this partial patch applied), because
   * a one-field patch can complete a foreign binding out of fields already
   * stored.
   *
   * KILL-SWITCHED (#850). The only procedure in this router that carries
   * `requireFeatureNotDenied('ticketing')`: it writes the ticketing binding
   * itself, so an org an operator has switched off must not be able to rebind
   * which provider event its conference points at. The rest of this router is
   * conference configuration, which a ticketing deny says nothing about.
   */
  updateTicketingIds: adminProcedure
    .use(requireFeatureNotDenied('ticketing'))
    .input(UpdateTicketingIdsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      const current = await clientReadUncached.fetch<{
        checkinEventId?: number | null
        titoAccountSlug?: string | null
        titoEventSlug?: string | null
      } | null>(
        // groq-global: keyed by the SERVER-resolved conference id, never client input.
        `*[_type == "conference" && _id == $id][0]{ checkinEventId, titoAccountSlug, titoEventSlug }`,
        { id: conferenceId },
        { cache: 'no-store' },
      )
      const effective = {
        checkinEventId:
          'checkinEventId' in input
            ? (input.checkinEventId ?? null)
            : (current?.checkinEventId ?? null),
        titoAccountSlug:
          'titoAccountSlug' in input
            ? (input.titoAccountSlug ?? null)
            : (current?.titoAccountSlug ?? null),
        titoEventSlug:
          'titoEventSlug' in input
            ? (input.titoEventSlug ?? null)
            : (current?.titoEventSlug ?? null),
      }
      if (await ticketingBindingIsClaimed(conferenceId, effective)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: TICKETING_BINDING_ALREADY_CLAIMED,
        })
      }
      return applyConferencePatch(conferenceId, input)
    }),

  /**
   * Set or clear this conference's OWN analytics identification code. Clearing
   * it (explicit `null`) is a supported end state: no code means no analytics
   * script is served on the public site at all.
   */
  updateAnalytics: adminProcedure
    .input(UpdateAnalyticsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  /**
   * Set or clear the place-specific /info answers and the social-wall hashtag.
   * Clearing a field is a supported end state: the corresponding FAQ question
   * stops rendering, and an empty hashtag means the wall performs no hashtag
   * search at all.
   */
  updateLocalInfo: adminProcedure
    .input(UpdateLocalInfoSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  updateCfpGoals: adminProcedure
    .input(UpdateCfpGoalsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  // === SE-1b: array & object fieldsets =====================================

  updateSocialLinks: adminProcedure
    .input(UpdateSocialLinksSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, {
        socialLinks: input.socialLinks,
      })
    }),

  updateVanityMetrics: adminProcedure
    .input(UpdateVanityMetricsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      // Object array items need a stable `_key`; preserve any existing key and
      // mint one for new rows.
      return applyConferencePatch(conferenceId, {
        vanityMetrics: ensureArrayKeys(input.vanityMetrics, 'metric'),
      })
    }),

  updateSponsorBenefits: adminProcedure
    .input(UpdateSponsorBenefitsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      // Drop optional `icon` when absent so we never store `icon: undefined`.
      const rows = input.sponsorBenefits.map((b) => ({
        title: b.title,
        description: b.description,
        ...(b.icon ? { icon: b.icon } : {}),
        ...(b._key ? { _key: b._key } : {}),
      }))
      return applyConferencePatch(conferenceId, {
        sponsorBenefits: ensureArrayKeys(rows, 'benefit'),
      })
    }),

  updateSponsorshipCustomization: adminProcedure
    .input(UpdateSponsorshipCustomizationSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      // Field-scoped: patch dot paths under the parent object so sibling
      // subfields we don't render are never touched.
      return applyConferencePatch(conferenceId, input, {
        pathPrefix: 'sponsorshipCustomization',
      })
    }),

  /**
   * SAFEGUARDED. In addition to the schema's shape/duplicate/hostname checks,
   * this mutation derives the request's current host SERVER-SIDE and refuses any
   * payload that would strand it (BAD_REQUEST). The client mirrors this with a
   * locked, non-removable row + a type-to-confirm gate, but the server is the
   * authority — a crafted request cannot bypass the guard.
   *
   * GLOBAL UNIQUENESS (#680): editing `domains[]` claims routing exactly like
   * creating an edition does, so the same overlap rule applies here — an entry
   * that ROUTING-OVERLAPS another conference's claim (exact, or a single-label
   * wildcard in either direction, see {@link findClaimedOverlaps}) is rejected
   * BAD_REQUEST naming it. Without this an organizer could add another tenant's
   * host — or a `*.` wildcard capturing it — to their own list and steal that
   * tenant's traffic (`getConferenceForDomain` serves the FIRST match).
   *
   * SELF-EXCLUSION: THIS conference's own entries are excluded from the claimed
   * set, so re-saving unchanged domains, reordering them, or removing one all
   * still succeed — only OTHER conferences' claims can collide.
   *
   * Both guards run BEFORE any write: a rejection patches nothing.
   */
  updateDomains: adminProcedure
    .input(UpdateDomainsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      const host = (await headers()).get('host') || ''
      if (domainsWouldStrandHost(input.domains, host)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: CANNOT_REMOVE_CURRENT_DOMAIN,
        })
      }
      const claimedElsewhere = await fetchClaimedDomains(conferenceId)
      const taken = findClaimedOverlaps(input.domains, claimedElsewhere)
      if (taken.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${DOMAIN_ALREADY_CLAIMED}: ${taken.join(', ')}`,
        })
      }
      // PLATFORM ZONE (#683): a subdomain of the platform's own zone may only be
      // claimed by the conference the platform ALLOCATED it to. Uniqueness alone
      // does not cover this — it would make an organizer's grab for an unissued
      // `<label>.<suffix>` exclusive and permanent, locking the rightful tenant
      // out forever. Refused before any write, like the guards above.
      const unallocated = await findUnallocatedPlatformDomains(
        conferenceId,
        input.domains,
      )
      if (unallocated.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${PLATFORM_DOMAIN_NOT_ALLOCATED}: ${unallocated.join(', ')}`,
        })
      }
      // Read the OUTGOING list before the patch so released entries can be
      // revoked — a domain that leaves `domains[]` must lose its verification
      // standing immediately, or it stays on the OAuth redirect allowlist as a
      // destination nobody is even routing any more (#683).
      const previous = await clientReadUncached.fetch<string[] | null>(
        // groq-global: keyed by the SERVER-resolved conference id, never client input.
        `*[_type == "conference" && _id == $id][0].domains`,
        { id: conferenceId },
      )
      const result = await applyConferencePatch(conferenceId, {
        domains: input.domains,
      })
      await syncDomainVerifications(
        conferenceId,
        input.domains,
        (previous ?? []).map(normalizeDomain),
      )
      return result
    }),

  // === SE-2: organizers, topics, teams & announcement ======================

  /**
   * SAFEGUARDED. `organizers[]` is the CANONICAL organizer set — it drives
   * `/admin` access and notification fan-out. Removing someone revokes their
   * admin access on their next session refresh.
   *
   * SELF-LOCKOUT GUARD: the acting organizer cannot remove THEMSELVES (they'd
   * lose their own admin access mid-edit). Removing OTHER organizers is allowed.
   * The guard binds to the server-derived caller identity (`ctx.speaker._id`),
   * so a crafted payload cannot bypass it. Non-empty + uniqueness are enforced by
   * the schema.
   */
  updateOrganizers: adminProcedure
    .input(UpdateOrganizersSchema)
    .mutation(async ({ ctx, input }) => {
      if (!input.organizers.includes(ctx.speaker._id)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: CANNOT_REMOVE_SELF_ORGANIZER,
        })
      }
      // REFERENCE INJECTION (#730): the self-lockout check above was the ONLY
      // check. `organizers[]` is what `organizerOrgIds` is derived from, so an
      // unvalidated id here rendered a foreign person as an organizer of this
      // conference AND granted them admin standing in this org on their next
      // sign-in. Every id must be a `speaker` this org already has standing over.
      //
      // `includeOrganizerStanding` is the ONE place the wider set is admitted:
      // re-saving `organizers[]` must not drop a sitting organizer who has never
      // spoken and whose `organizations[]` was never stamped. It is safe here
      // and nowhere near `talk.speakers[]`, because `organizers[]` does not feed
      // `speakerParticipationOrgIds` — referencing someone here grants the
      // caller no ownership over them.
      await requireSpeakersInCurrentOrg(input.organizers, {
        includeOrganizerStanding: true,
      })
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, {
        organizers: input.organizers.map((id) =>
          createReferenceWithKey(id, 'organizer'),
        ),
      })
    }),

  updateTopics: adminProcedure
    .input(UpdateTopicsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      // REFERENCE INJECTION (#730): topics are org-owned, and these ids were
      // written verbatim — another tenant's taxonomy rendered in this CFP.
      //
      // Only NEWLY ADDED ids are checked, mirroring `updateTeams`' validate-
      // against-the-live-set pattern. An id already on this conference was
      // already referenced, so admitting it cannot inject anything — and an
      // org-less legacy topic (migration 044) stays removable instead of making
      // the whole editor refuse every save.
      const currentTopicIds = new Set(
        (await clientReadUncached.fetch<string[] | null>(
          // groq-global: reads THIS request's own conference by its
          // server-resolved id (never a client id) — the same shape as
          // `updateTeams`' organizer-set read directly below.
          `*[_type == "conference" && _id == $id][0].topics[]._ref`,
          { id: conferenceId },
        )) ?? [],
      )
      await requireDocumentsInCurrentOrg(
        input.topics.filter((id) => !currentTopicIds.has(id)),
        'topic',
      )
      return applyConferencePatch(conferenceId, {
        topics: input.topics.map((id) => createReferenceWithKey(id, 'topic')),
      })
    }),

  /**
   * Formats — the conference's `formats[]` CFP/agenda format keys. Unlike
   * topics these are plain enum STRINGS (no reference/`_key` wrapping), so the
   * validated array is stored verbatim. Field-scoped full-array replace; the
   * Zod schema guarantees ≥1, unique, and only canonical {@link Format} keys.
   */
  updateFormats: adminProcedure
    .input(UpdateFormatsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, {
        formats: input.formats,
      })
    }),

  /**
   * Organizer teams — a SOFT LENS over the organizer set (routing / mail
   * defaults), NEVER an access boundary. Full-array replace.
   *
   * SUBSET ENFORCEMENT: every team member must be one of THIS conference's
   * current organizers. The Sanity schema only documents this (Studio filters
   * the picker); the router ENFORCES it against the live organizer set so a
   * crafted payload cannot add a non-organizer. Key uniqueness/kebab and
   * members≥1 come from the schema.
   *
   * On success the per-instance teams cache is cleared so routing/lenses observe
   * the change immediately on this instance (other instances refresh within the
   * cache TTL).
   */
  updateTeams: adminProcedure
    .input(UpdateTeamsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      const organizerIds = await clientReadUncached.fetch<string[] | null>(
        `*[_type == "conference" && _id == $id][0].organizers[]._ref`,
        { id: conferenceId },
      )
      const organizerSet = new Set(organizerIds ?? [])
      for (const team of input.teams) {
        const strays = team.members.filter((m) => !organizerSet.has(m))
        if (strays.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Team "${team.title}" has ${strays.length} member${
              strays.length === 1 ? '' : 's'
            } who ${strays.length === 1 ? 'is' : 'are'} not an organizer of this conference`,
          })
        }
      }
      const teams = ensureArrayKeys(
        input.teams.map((team) => ({
          _type: 'organizerTeam',
          key: team.key,
          title: team.title,
          members: team.members.map((id) =>
            createReferenceWithKey(id, 'member'),
          ),
          ...(team.slackChannel ? { slackChannel: team.slackChannel } : {}),
          ...(team.emailIdentity && team.emailIdentity.length > 0
            ? { emailIdentity: team.emailIdentity }
            : {}),
          ...(team._key ? { _key: team._key } : {}),
        })),
        'team',
      )
      const result = await applyConferencePatch(conferenceId, { teams })
      // Routing/lenses read a short-TTL per-instance cache; clear it so this
      // instance reflects the edit without waiting out the TTL.
      clearConferenceTeamsCache()
      return result
    }),

  /**
   * Announcement rich text (portable text). A full replace; an empty/`null`
   * array UNSETS the field so the landing-page banner stops rendering (see
   * `Hero.tsx`).
   */
  updateAnnouncement: adminProcedure
    .input(UpdateAnnouncementSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      const blocks = input.announcement
      const value =
        !blocks || blocks.length === 0 ? null : ensureArrayKeys(blocks, 'block')
      return applyConferencePatch(conferenceId, { announcement: value })
    }),

  // === Homepage Composition (front-page builder F1/F2) =====================

  /**
   * Replace the homepage section composition. Full-array replace like the other
   * array fieldsets. An EMPTY list UNSETS the field so the page falls back to the
   * phase-aware default layout (never a blank homepage). Object items are
   * given a UNIQUE `_key` (client keys kept when present, missing/duplicate
   * ones generated) and stripped of null/empty optionals so nothing but the
   * intended presentation config is stored. The strict discriminated-union schema
   * has already rejected any unknown block type.
   */
  updateHomepageSections: adminProcedure
    .input(UpdateHomepageSectionsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      if (input.homepageSections.length === 0) {
        return applyConferencePatch(conferenceId, { homepageSections: null })
      }
      const sections = ensureUniqueArrayKeys(
        input.homepageSections.map((section) => {
          // Keep the discriminator + optional visibility flag; then layer on the
          // block-specific config, dropping null/undefined so we never store an
          // empty override.
          const base: Record<string, unknown> = { _type: section._type }
          if (section.hidden) base.hidden = true
          if ('_key' in section && section._key) base._key = section._key
          // The presentation VARIANT, for all 13 types at once — deliberately
          // ONE line ABOVE the per-type switch rather than thirteen inside it,
          // because a per-type mapping is exactly where a new field gets
          // forgotten for one block and silently never arrives.
          //
          // A DEFAULT variant is NEVER persisted (same non-default-only
          // discipline as `hidden` and `showCta`), and that is the whole
          // back-compat story: editions that store nothing keep storing
          // nothing, a composition saved without touching the picker
          // serializes to the bytes it serializes today, and `resolveVariant`
          // reads an absent variant back as the default anyway.
          if (
            section.variant &&
            section.variant !== defaultVariant(section._type)
          )
            base.variant = section.variant

          switch (section._type) {
            case 'homepageHero': {
              if (section.heroHeadline) base.heroHeadline = section.heroHeadline
              if (section.heroSubheadline)
                base.heroSubheadline = section.heroSubheadline
              if (section.ctaOverrides && section.ctaOverrides.length > 0) {
                base.ctaOverrides = ensureUniqueArrayKeys(
                  section.ctaOverrides.map((cta) => ({
                    label: cta.label,
                    href: cta.href,
                    ...(cta._key ? { _key: cta._key } : {}),
                  })),
                  'cta',
                )
              }
              break
            }
            case 'homepageSaveTheDate': {
              if (section.heading) base.heading = section.heading
              if (section.description) base.description = section.description
              break
            }
            case 'homepageMetrics': {
              if (section.heading) base.heading = section.heading
              break
            }
            case 'homepageFeaturedSpeakers':
            case 'homepageOrganizers':
            case 'homepageGallery': {
              // Copy-only overrides: content still comes from the conference.
              // An omitted field is what makes the band fall back to the house
              // default copy, so blanks are never stored.
              if (section.heading) base.heading = section.heading
              if (section.description) base.description = section.description
              break
            }
            case 'homepageSponsors': {
              if (section.heading) base.heading = section.heading
              if (section.description) base.description = section.description
              // Only the NON-default (hidden) state is persisted, mirroring
              // `hidden` — absent means the CTA card shows, as it always has.
              if (section.showCta === false) base.showCta = false
              if (section.ctaHeading) base.ctaHeading = section.ctaHeading
              if (section.ctaDescription)
                base.ctaDescription = section.ctaDescription
              break
            }
            case 'homepageCtaBanner': {
              base.heading = section.heading
              if (section.body) base.body = section.body
              base.buttonLabel = section.buttonLabel
              base.buttonHref = section.buttonHref
              break
            }
            case 'homepageRichText': {
              if (section.heading) base.heading = section.heading
              // Already sanitised AND fully keyed (blocks, spans, markDefs,
              // table rows) by `HomepageRichTextContentSchema`'s terminal
              // transform — re-keying here would only risk re-pointing a span's
              // mark at the wrong link annotation.
              base.content = section.content
              break
            }
            case 'homepageFaq': {
              if (section.heading) base.heading = section.heading
              // Persist only the EFFECTIVE config: `source` only when it's the
              // non-default 'ticketFaqs', and `items` only when they're what
              // renders ('own') — a block in ticketFaqs mode must not store
              // dead item drafts.
              const usesTicketFaqs = section.source === 'ticketFaqs'
              if (usesTicketFaqs) base.source = 'ticketFaqs'
              if (
                !usesTicketFaqs &&
                section.items &&
                section.items.length > 0
              ) {
                base.items = ensureUniqueArrayKeys(
                  section.items.map((item) => ({
                    question: item.question,
                    answer: item.answer,
                    ...(item._key ? { _key: item._key } : {}),
                  })),
                  'faq',
                )
              }
              break
            }
            case 'homepageCountdown': {
              if (section.heading) base.heading = section.heading
              if (section.targetOverride)
                base.targetOverride = section.targetOverride
              if (section.liveMessage) base.liveMessage = section.liveMessage
              break
            }
            case 'homepageVenue': {
              if (section.heading) base.heading = section.heading
              if (section.description) base.description = section.description
              break
            }
            default:
              // Program highlights carries no config of its own — only
              // `_type`/`_key`/`hidden`.
              break
          }
          return base
        }),
        'section',
      )
      return applyConferencePatch(conferenceId, { homepageSections: sections })
    }),

  // === SE-3: branding logos (inlineSvg upload) =============================

  /**
   * Dry-run SVG sanitizer preview. Runs the SAME server-side sanitizer the write
   * path uses (`sanitizeSvgUpload`) but persists NOTHING, so the Branding editor
   * can show the organizer exactly what will be stored — and what was stripped —
   * before they commit. A rejected payload (oversize / non-SVG / entity) returns
   * `ok: false` with the reason rather than throwing, so the UI can render it.
   */
  sanitizeSvgPreview: adminProcedure
    .input(SanitizeSvgPreviewSchema)
    .mutation(async ({ input }) => {
      const result = sanitizeSvgUpload(input.svg)
      return {
        ok: result.ok,
        svg: result.svg,
        removed: result.removed,
        sizeBytes: result.sizeBytes,
        error: result.error ?? null,
      }
    }),

  /**
   * Patch ONE branding logo slot (`logoBright` | `logoDark` | `logomarkBright` |
   * `logomarkDark`). The markup is sanitized SERVER-SIDE — the authority, never
   * the client — before it is stored; `svg: null` UNSETS the slot. Field-scoped
   * per the house invariant: only the one slot is touched.
   */
  updateBrandingLogo: adminProcedure
    .input(UpdateBrandingLogoSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      let sanitized: string | null
      try {
        sanitized = sanitizeSvgFieldOrThrow(input.svg)
      } catch (error) {
        if (error instanceof SvgSanitizeError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })
        }
        throw error
      }
      return applyConferencePatch(conferenceId, { [input.slot]: sanitized })
    }),

  // === SE-5: create-next-edition wizard ====================================

  /**
   * Availability probe for the wizard's Domains step. Given the typed hostnames,
   * returns which are ALREADY `taken` — claimed by some conference under the
   * same routing-overlap rule the mutation enforces — so the editor can flag
   * them inline before the maintainer reaches the confirm step. Hostname SHAPE
   * is validated client-side (`domainsLocalErrors`) and by the mutation's
   * schema, not here. Read-only, and only a mirror: `createEdition` is the
   * authority.
   */
  validateNewDomains: adminProcedure
    .input(ValidateNewDomainsSchema)
    .query(async ({ input }) => {
      const claimed = await fetchClaimedDomains()
      const normalized = input.domains.map(normalizeDomain).filter((d) => d)
      const taken = findClaimedOverlaps(
        Array.from(new Set(normalized)),
        claimed,
      )
      return { taken }
    }),

  /**
   * Availability probe for the SETTINGS Domains editor — the mirror of
   * {@link conferenceRouter.updateDomains} exactly as `validateNewDomains`
   * mirrors `createEdition`, so a cross-tenant conflict surfaces inline instead
   * of failing on save. Same `{ taken }` shape and same routing-overlap rule.
   *
   * Differs from `validateNewDomains` in ONE way, and it is the whole point:
   * the CURRENT conference (resolved from the request domain, never from
   * client input) is excluded from the claimed set — its own entries are not
   * conflicts with itself. Read-only, and only a mirror: the mutation is the
   * authority.
   */
  validateUpdatedDomains: adminProcedure
    .input(ValidateNewDomainsSchema)
    .query(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      const claimed = await fetchClaimedDomains(conferenceId)
      const normalized = input.domains.map(normalizeDomain).filter((d) => d)
      const taken = findClaimedOverlaps(
        Array.from(new Set(normalized)),
        claimed,
      )
      return { taken }
    }),

  /**
   * Seed a NEW conference edition that clones the CURRENT edition's STRUCTURE
   * (per the `clone` flags) with fresh dates + domains. The current conference —
   * resolved from the request domain, exactly like every other mutation — is the
   * SOURCE and is NEVER modified (no patch/set touches its id).
   *
   * DOMAIN VALIDATION: shape/duplicate/hostname come from the schema; here we
   * add the GLOBAL-uniqueness rule (a domain that ROUTING-OVERLAPS any
   * conference's claim — exact or single-label wildcard, either direction — is
   * rejected, BAD_REQUEST naming it) — the server is the authority, the wizard
   * only mirrors it.
   *
   * ATOMICITY: the new conference document and every cloned reference-carrying
   * document (sponsor tiers, contract templates) are written in ONE Sanity
   * transaction, which is all-or-nothing. A failure writes NOTHING — there is no
   * partial-create state to recover, and the wizard is simply re-runnable.
   *
   * Returns the new conference `_id` and a per-family clone summary.
   */
  createEdition: adminProcedure
    .input(CreateEditionSchema)
    .mutation(async ({ input }) => {
      const sourceId = await resolveConferenceId()

      const [source, sourceTiers, sourceTemplates, claimedDomains, orgSlug] =
        await Promise.all([
          clientReadUncached.fetch<SourceConference | null>(
            `*[_type == "conference" && _id == $id][0]`,
            { id: sourceId },
          ),
          clientReadUncached.fetch<SourceSponsorTier[]>(
            `*[_type == "sponsorTier" && conference._ref == $id]`,
            { id: sourceId },
          ),
          clientReadUncached.fetch<SourceContractTemplate[]>(
            `*[_type == "contractTemplate" && conference._ref == $id]`,
            { id: sourceId },
          ),
          fetchClaimedDomains(),
          // The org slug is what the platform hosts are minted FROM. Read from
          // the source conference's organization ref — never from client input.
          clientReadUncached.fetch<string | null>(
            // groq-global-scoped: keyed by the SERVER-resolved source conference id (`resolveConferenceId`, from the request Host), exactly like the reads above it.
            `*[_type == "conference" && _id == $id][0].organization->slug.current`,
            { id: sourceId },
          ),
        ])

      if (!source?._id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Could not resolve the source conference',
        })
      }

      // GLOBAL domain uniqueness — the authority. `input.domains` is already
      // normalized/validated for shape by the schema. Uniqueness is judged by
      // ROUTING overlap, not string equality (see {@link findClaimedOverlaps}).
      const taken = findClaimedOverlaps(input.domains, claimedDomains)
      if (taken.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${DOMAIN_ALREADY_CLAIMED}: ${taken.join(', ')}`,
        })
      }

      const newConferenceId = generateKey('conference')

      // PLATFORM ZONE (#683): a new edition is a NEW conference, so it holds no
      // allocation of its own — every in-zone hostname it asks for is
      // unallocated by definition and is refused here. Another platform
      // subdomain for a new edition is a platform grant, not something a tenant
      // can self-serve. Refused BEFORE the transaction, so nothing is written.
      const unallocated = await findUnallocatedPlatformDomains(
        newConferenceId,
        input.domains,
      )
      if (unallocated.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${PLATFORM_DOMAIN_NOT_ALLOCATED}: ${unallocated.join(', ')}`,
        })
      }

      // PLATFORM HOSTS FOR THE NEW EDITION: its own permanent
      // `<org-slug>-<year>` address, plus the short `<org-slug>` address when
      // this edition is genuinely the org's latest — which means TRANSFERRING
      // that one off the edition currently holding it.
      const hostPlan = await planEditionPlatformHosts({
        orgSlug,
        organizationId: source.organization?._ref ?? null,
        startDate: input.startDate,
        claimedDomains,
      })
      if (hostPlan.conflict !== null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${DOMAIN_ALREADY_CLAIMED}: ${hostPlan.conflict}`,
        })
      }

      const { conference, sponsorTiers, contractTemplates, summary } =
        buildEditionDocuments(
          {
            conference: source,
            sponsorTiers: sourceTiers ?? [],
            contractTemplates: sourceTemplates ?? [],
          },
          // The minted hosts lead, so the short address is the edition's
          // primary one; the organizer's own domains follow, deduplicated.
          {
            ...input,
            domains: [
              ...hostPlan.claim,
              ...input.domains.filter(
                (entry) => !hostPlan.claim.includes(normalizeDomain(entry)),
              ),
            ],
          },
          {
            newConferenceId,
            mintId: () => generateKey('doc'),
            mintKey: () => generateKey('key'),
          },
        )

      try {
        let tx = clientWrite.transaction().create(conference)
        for (const tier of sponsorTiers) tx = tx.create(tier)
        for (const tpl of contractTemplates) tx = tx.create(tpl)
        // THE TRANSFER, in the SAME all-or-nothing transaction that claims it.
        // `domains[]` is globally unique, so releasing and claiming cannot be
        // two writes: one of them failing would leave the short address on
        // both editions (a routing collision) or on neither (an address that
        // resolves nowhere). Atomicity is what rules both out.
        if (hostPlan.releaseFrom !== null && hostPlan.transferring !== null) {
          const releasing = hostPlan.transferring
          tx = tx.patch(hostPlan.releaseFrom, (p) =>
            p.unset([`domains[@ == "${releasing}"]`]),
          )
        }
        await tx.commit()
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create the new edition',
          cause: error,
        })
      }

      // A new edition CLAIMS new domains, so it needs verification records —
      // pending, never inherited from the source edition. Best-effort (#683):
      // the edition is already committed and a missing record fails closed.
      await syncDomainVerifications(newConferenceId, input.domains)
      // The minted hosts are ALLOCATED (#778) — and only these, because they
      // were derived server-side from the tenant's OWN org slug rather than
      // typed. Anything the organizer types is still refused above by
      // `findUnallocatedPlatformDomains`, so a tenant can never self-serve a
      // grant on a label outside its own namespace. A transferred host is
      // re-pointed to the new holder by the same call.
      if (hostPlan.claim.length > 0) {
        await syncDomainVerifications(newConferenceId, hostPlan.claim, [], {
          allocatePlatformHosts: true,
        })
      }

      // New edition adds a conference document; bust the shared conferences tag
      // so domain resolution can see it once its domain actually resolves.
      revalidateTag('content:conferences', 'default')

      return {
        conferenceId: newConferenceId,
        summary: { conference: 1, ...summary },
      }
    }),

  // === Homepage composer preview (E3) ======================================

  /**
   * Everything the PUBLIC homepage renders from, for the composer's live
   * preview — the same include set as `src/app/(main)/page.tsx` plus the same
   * ticket resolution, so the preview renders the real section components off
   * real data rather than an approximation.
   *
   * DELIBERATELY UNCACHED. The public page wraps its read in `'use cache'` with
   * `cacheLife('hours')`; serving that here would show an organizer the page as
   * it was up to an hour before the edit they just made — the exact failure the
   * preview exists to remove. `uncached: true` bypasses both Next's cache and
   * the Sanity CDN. A tenant-scoped `'use cache'` was considered and rejected:
   * it would re-open the scopedFetch fail-open class for a read whose whole
   * point is freshness, on an admin-only, on-demand endpoint.
   *
   * The ticket read is the ONE exception: `getPublicTicketTypes` carries its own
   * `'use cache'`, prices are not what the composer edits, and it is an outbound
   * call to a third party. Its failure is swallowed exactly as the public page
   * swallows it — a preview must never fail because checkin.no is down.
   *
   * TENANCY: the conference comes from the request Host, never from the client,
   * and `adminProcedure` has already gated the caller as an organizer of the
   * request org. The payload is the same bytes the public page serves, so the
   * endpoint discloses nothing an anonymous visitor cannot already read.
   */
  homepagePreviewData: adminProcedure.query(async () => {
    const headersList = await headers()
    const domain = headersList.get('host') || ''

    const { conference, error } = await getConferenceForDomain(domain, {
      organizers: true,
      sponsors: true,
      sponsorTiers: true,
      featuredSpeakers: true,
      featuredTalks: true,
      schedule: true,
      gallery: { featuredOnly: true },
      uncached: true,
    })

    if (error || !conference?._id) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Could not resolve conference from domain',
      })
    }

    let ticketsFromPrice: string | null = null
    let ticketAvailability: TicketAvailability | null = null
    if (hasTicketingBinding(conference)) {
      try {
        const ticketData = await getPublicTicketTypes(
          ticketingBinding(conference),
        )
        if (ticketData.status === 'ok') {
          ticketsFromPrice =
            getLowestTicketPrice(ticketData.tickets)?.formatted ?? null
          // Mirrors the public homepage exactly (free types count toward
          // availability) so the preview shows the same bytes.
          ticketAvailability = getTicketAvailability([
            ...ticketData.tickets,
            ...ticketData.freeTickets,
          ])
        }
      } catch (ticketError) {
        console.error(
          'Failed to fetch ticket prices for homepage preview:',
          ticketError,
        )
      }
    }

    return { conference, ticketsFromPrice, ticketAvailability }
  }),
})
