import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { headers } from 'next/headers'
import { router, adminProcedure, resolveConferenceId } from '../trpc'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import {
  ensureArrayKeys,
  createReferenceWithKey,
  generateKey,
} from '@/lib/sanity/helpers'
import { clearConferenceTeamsCache } from '@/lib/teams'
import {
  CANNOT_REMOVE_CURRENT_DOMAIN,
  domainsWouldStrandHost,
  normalizeDomain,
} from '@/lib/conference/domains'
import {
  buildEditionDocuments,
  type SourceConference,
  type SourceSponsorTier,
  type SourceContractTemplate,
} from '@/lib/conference/edition'
import {
  UpdateBasicInfoSchema,
  UpdateVenueSchema,
  UpdateDatesSchema,
  UpdateRegistrationSchema,
  UpdateCommunicationSchema,
  UpdateTicketingIdsSchema,
  UpdateCfpGoalsSchema,
  UpdateSocialLinksSchema,
  UpdateVanityMetricsSchema,
  UpdateSponsorBenefitsSchema,
  UpdateSponsorshipCustomizationSchema,
  UpdateDomainsSchema,
  UpdateOrganizersSchema,
  UpdateTopicsSchema,
  UpdateTeamsSchema,
  UpdateAnnouncementSchema,
  UpdateBrandingLogoSchema,
  SanitizeSvgPreviewSchema,
  CreateEditionSchema,
  ValidateNewDomainsSchema,
} from '../schemas/conference'
import {
  sanitizeSvgUpload,
  sanitizeSvgFieldOrThrow,
  SvgSanitizeError,
} from '@/lib/svg/upload'

/** The message the self-lockout guard rejects a self-removal with. */
export const CANNOT_REMOVE_SELF_ORGANIZER =
  'You cannot remove yourself from the organizer team'

/** Prefix for the BAD_REQUEST thrown when a new-edition domain is already taken. */
export const DOMAIN_ALREADY_CLAIMED = 'Already used by another conference'

/**
 * Every domain claimed by ANY conference document, normalized. Drives the
 * wizard's GLOBAL-uniqueness rule: a new edition must never shadow an existing
 * edition's routing (`getConferenceForDomain` picks the FIRST conference whose
 * `domains[]` matches the host — a duplicate would silently steal traffic).
 */
async function fetchClaimedDomains(): Promise<Set<string>> {
  const all = await clientReadUncached.fetch<string[] | null>(
    `*[_type == "conference" && defined(domains)].domains[]`,
  )
  return new Set((all ?? []).map(normalizeDomain))
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
    revalidateTag('content:conferences', 'default')
    revalidateTag(`sanity:conference-${conferenceId}`, 'default')

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

  updateVenue: adminProcedure
    .input(UpdateVenueSchema)
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

  updateTicketingIds: adminProcedure
    .input(UpdateTicketingIdsSchema)
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
      return applyConferencePatch(conferenceId, { domains: input.domains })
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
      return applyConferencePatch(conferenceId, {
        topics: input.topics.map((id) => createReferenceWithKey(id, 'topic')),
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
   * returns which are ALREADY claimed by some conference (global uniqueness) and
   * which are not valid bare hostnames — so the editor can flag them inline
   * before the maintainer reaches the confirm step. Read-only.
   */
  validateNewDomains: adminProcedure
    .input(ValidateNewDomainsSchema)
    .query(async ({ input }) => {
      const claimed = await fetchClaimedDomains()
      const normalized = input.domains.map(normalizeDomain).filter((d) => d)
      const taken = Array.from(new Set(normalized)).filter((d) =>
        claimed.has(d),
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
   * add the GLOBAL-uniqueness rule (a domain claimed by any conference is
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

      const [source, sourceTiers, sourceTemplates, claimedDomains] =
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
        ])

      if (!source?._id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Could not resolve the source conference',
        })
      }

      // GLOBAL domain uniqueness — the authority. `input.domains` is already
      // normalized/validated for shape by the schema.
      const taken = input.domains.filter((d) => claimedDomains.has(d))
      if (taken.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${DOMAIN_ALREADY_CLAIMED}: ${taken.join(', ')}`,
        })
      }

      const newConferenceId = generateKey('conference')
      const { conference, sponsorTiers, contractTemplates, summary } =
        buildEditionDocuments(
          {
            conference: source,
            sponsorTiers: sourceTiers ?? [],
            contractTemplates: sourceTemplates ?? [],
          },
          input,
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
        await tx.commit()
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create the new edition',
          cause: error,
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
})
