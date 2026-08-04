import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import { headers } from 'next/headers'
import { router, adminProcedure, resolveConferenceId } from '../trpc'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
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
