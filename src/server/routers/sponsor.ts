import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { revalidateTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import { router, adminProcedure, resolveConferenceId } from '../trpc'
import {
  requireDocumentInCurrentConference,
  requireDocumentInCurrentOrg,
  requireDocumentsInCurrentConference,
} from '../tenancy'
import {
  SponsorInputSchema,
  SponsorUpdateSchema,
  SponsorIdSchema,
  IdParamSchema,
  SponsorTierInputSchema,
  SponsorTierUpdateSchema,
  SponsorEmailTemplateInputSchema,
  SponsorEmailTemplateUpdateSchema,
  ReorderTemplatesSchema,
  SetDefaultTemplateSchema,
} from '../schemas/sponsor'
import {
  getAllSponsors,
  searchSponsors,
  createSponsor,
  getSponsor,
  updateSponsor,
  deleteSponsor,
  getSponsorTier,
  createSponsorTier,
  updateSponsorTier,
  deleteSponsorTier,
  getSponsorEmailTemplates,
  getSponsorEmailTemplate,
  createSponsorEmailTemplate,
  updateSponsorEmailTemplate,
  deleteSponsorEmailTemplate,
  setDefaultSponsorEmailTemplate,
  reorderSponsorEmailTemplates,
} from '@/lib/sponsor/sanity'
import { validateSponsor, validateSponsorTier } from '@/lib/sponsor/validation'
import {
  checkSponsorBlueskyHandle,
  parseSponsorSocials,
} from '@/lib/sponsor/bluesky-handle'
import { sanitizeSvgFieldOrThrow, SvgSanitizeError } from '@/lib/svg/upload'
import {
  buildTemplateVariables,
  suggestTemplateCategory,
  suggestTemplateLanguage,
} from '@/lib/sponsor/templates'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  conferenceBaseUrl,
  hasConferenceDomain,
} from '@/lib/conference/baseUrl'
import {
  getOrganizationRefForCurrentConference,
  getOrganizationRefViaParentConference,
} from '@/lib/organization/sanity'
import type { Conference } from '@/lib/conference/types'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import type {
  SponsorSaveResult,
  SponsorTierExisting,
} from '@/lib/sponsor/types'
import type {
  SponsorTag,
  SponsorForConferenceInput,
} from '@/lib/sponsor-crm/types'
import {
  createSponsorForConference,
  updateSponsorForConference,
  deleteSponsorForConference,
  getSponsorForConference,
  listSponsorsForConference,
  countSponsorsForConference,
  copySponsorsFromPreviousYear,
  importAllHistoricSponsors,
  tierExists,
} from '@/lib/sponsor-crm/sanity'
import {
  logStageChange,
  logInvoiceStatusChange,
  logContractStatusChange,
  logSponsorCreated,
  logAssignmentChange,
  logSignatureStatusChange,
  createSponsorActivity,
  updateSponsorActivity,
  deleteSponsorActivity,
  promoteToClosedWonOnContract,
} from '@/lib/sponsor-crm/activity'
import { createNotifications } from '@/lib/notification/sanity'
import { resolveRoutedOrganizerIds } from '@/lib/teams'
import type { NotificationInput } from '@/lib/notification/types'
import {
  SponsorForConferenceInputSchema,
  SponsorForConferenceUpdateSchema,
  SponsorForConferenceIdSchema,
  DeleteSponsorSchema,
  MoveStageSchema,
  UpdateInvoiceStatusSchema,
  UpdateContractStatusSchema,
  CopySponsorsSchema,
  ImportAllHistoricSponsorsSchema,
  BulkUpdateSponsorCRMSchema,
  BulkDeleteSponsorCRMSchema,
  CreateSponsorActivitySchema,
  UpdateSponsorActivitySchema,
  SponsorCRMFilterSchema,
  SendCommunicationSchema,
  AssignDiscountCodesSchema,
  SponsorDiscountCodeOptionsSchema,
  CommunicationRecordIdSchema,
  ListCommunicationsSchema,
} from '@/server/schemas/sponsorForConference'
import {
  listActivitiesForSponsor,
  listActivitiesForConference,
  getCommunicationRecord,
  listCommunicationsForSponsor,
} from '@/lib/sponsor-crm/activities'
import { sendSponsorCommunication } from '@/lib/sponsor-crm/communication-send'
import {
  appendLinkedCodes,
  codesToAdopt,
  DiscountCodeLinkError,
  linkCodesToSponsor,
  listEventDiscounts,
  readSponsorCodeLinks,
  resolveChosenCodes,
  withLinkedCodes,
  type ResolvedDiscountCode,
  type SponsorCodeLink,
} from '@/lib/sponsor-crm/discount-codes'
import { claimDiscountCodes } from '@/lib/sponsor-crm/discount-code-claims'
import { normalizeDiscountCode, sponsorOwningCode } from '@/lib/discounts'
import {
  discountCodeAttachments,
  discountCodesCardHtml,
  sponsorTicketUrl,
} from '@/lib/sponsor-crm/discount-email'
import {
  TEMPLATE_NOT_FOUND_MESSAGE,
  TEMPLATE_WRONG_KIND_MESSAGE,
} from '@/lib/sponsor-crm/communication'
import {
  bulkUpdateSponsors,
  bulkDeleteSponsors,
  BulkTenancyError,
} from '@/lib/sponsor-crm/bulk'
import { scopedFetch } from '@/lib/sanity/scoped'
import {
  listContractTemplates,
  getContractTemplate,
  createContractTemplate,
  updateContractTemplate,
  deleteContractTemplate,
  findBestContractTemplate,
} from '@/lib/sponsor-crm/contract-templates'
import {
  ContractTemplateInputSchema,
  ContractTemplateUpdateSchema,
  ContractTemplateIdSchema,
  ContractTemplateListSchema,
  GenerateContractPdfSchema,
  FindBestContractTemplateSchema,
  SendContractSchema,
  PreviewContractPdfSchema,
} from '@/server/schemas/contractTemplate'
import { generateContractPdf } from '@/lib/sponsor-crm/contract-pdf'
import { embedSignatureInPdfBuffer } from '@/lib/pdf/signature-embed'
import {
  ORGANIZER_SIGNATURE_MARKER,
  ORGANIZER_DATE_MARKER,
} from '@/lib/pdf/constants'
import { checkContractReadiness } from '@/lib/sponsor-crm/contract-readiness'
import { auditSponsorHealth } from '@/lib/sponsor-crm/health'
import { isBillingComplete } from '@/lib/sponsor-crm/billing'
import { evaluateInvoiceReadiness } from '@/lib/sponsor-crm/invoice'
import {
  canTransition,
  checkPipelineState,
  checkState,
  type TransitionResult,
} from '@/lib/sponsor-crm/state-machine'
import { preconditionFailed } from '@/server/errors'
import { UpdateSignatureStatusSchema } from '@/server/schemas/sponsorForConference'
import {
  getSigningProvider,
  type SigningProviderType,
} from '@/lib/contract-signing'
import { resolveConferenceFrom } from '@/lib/email/from'
import { sendBroadcastEmail } from '@/lib/email/broadcast'
import { syncSponsorAudience, type Contact } from '@/lib/email/audience'
import { logBulkEmailSent } from '@/lib/sponsor-crm/activity'
import { isValidPortableText } from '@/lib/portabletext/validation'
import type { PortableTextBlock } from '@portabletext/types'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import type { SponsorEmailTemplate } from '@/lib/sponsor/types'
import { publishSponsorStatusChange } from '@/lib/sponsor-crm/events'
import '@/lib/events/registry'

/**
 * The ticketing kill switch (#850) for the discount kind of a send — the
 * `requireFeatureNotDenied('ticketing')` rule applied to ONE kind of a shared
 * procedure, with the middleware's exact message.
 */
async function refuseIfTicketingDenied(orgId: string | null | undefined) {
  const { isFeatureExplicitlyDeniedForOrg } =
    await import('@/lib/features/platform-default')
  if (await isFeatureExplicitlyDeniedForOrg(orgId ?? null, 'ticketing')) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'The "ticketing" feature has been switched off for this organization',
    })
  }
}

/** Provider codes the conference cannot read are refused as one message. */
const TICKETING_NOT_CONFIGURED =
  'Ticketing is not configured for this conference'

/**
 * The stored links, or an organizer-facing refusal — never the Sanity
 * client's own error text (#1262 review). Every path that reads them fails
 * closed: without the read neither ownership nor dedupe can be checked.
 */
async function readLinksOrThrow(conferenceId: string) {
  try {
    return await readSponsorCodeLinks(conferenceId)
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Could not read this conference’s sponsors. Try again.',
      cause: error,
    })
  }
}

/** The conference's provider codes, or the refusal a caller should surface. */
async function readEventDiscountsOrThrow(conference: Conference) {
  let listed: Awaited<ReturnType<typeof listEventDiscounts>>
  try {
    listed = await listEventDiscounts(conference)
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Could not read the discount codes from the ticketing provider',
      cause: error,
    })
  }
  if (!listed.ok) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: TICKETING_NOT_CONFIGURED,
    })
  }
  return listed.discounts
}

/**
 * Check organizer-chosen codes against the conference's OWN provider event
 * and every sponsor's stored link (#1262). Shared by the discount send and the
 * discount code manager's Assign; nothing is written here.
 */
async function resolveSponsorDiscountCodes(
  conference: Conference,
  sponsorForConferenceId: string,
  chosen: readonly string[],
) {
  const discounts = await readEventDiscountsOrThrow(conference)
  const links = await readLinksOrThrow(conference._id)
  try {
    const codes = resolveChosenCodes(
      chosen,
      discounts,
      links,
      sponsorForConferenceId,
    )
    const alreadyLinked =
      links.find((l) => l.sponsorForConferenceId === sponsorForConferenceId)
        ?.linkedCodes ?? []
    const adoptable = codesToAdopt(
      discounts,
      withLinkedCodes(conference.sponsors, links),
      sponsorForConferenceId,
    )
    // THE LOCK (PR #1272 review): the checks above read one snapshot; the
    // claim is what makes two concurrent links of one code impossible. The
    // chosen codes must all be won; an adopted code another sponsor holds is
    // simply not adopted.
    const orgRef = await getOrganizationRefViaParentConference(
      sponsorForConferenceId,
    )
    const claim = (
      list: readonly ResolvedDiscountCode[],
      onConflict: 'refuse' | 'drop',
    ) =>
      claimDiscountCodes({
        conferenceId: conference._id,
        orgRef,
        sponsorForConferenceId,
        codes: list,
        links,
        onConflict,
      })
    const chosenHold = await claim(codes, 'refuse')
    let adoptedHold: Awaited<ReturnType<typeof claim>>
    try {
      adoptedHold = await claim(adoptable, 'drop')
    } catch (error) {
      await chosenHold.release()
      throw error
    }
    return {
      codes: chosenHold.held,
      alreadyLinked,
      adopted: adoptedHold.held,
      /** Give the claims back when nothing was linked after all. */
      release: async () => {
        await chosenHold.release()
        await adoptedHold.release()
      },
    }
  } catch (error) {
    if (error instanceof DiscountCodeLinkError) {
      throw new TRPCError({ code: error.code, message: error.message })
    }
    throw error
  }
}

async function prepareDiscountSend(
  conference: Conference,
  sponsorForConferenceId: string,
  chosen: readonly string[],
) {
  const resolved = await resolveSponsorDiscountCodes(
    conference,
    sponsorForConferenceId,
    chosen,
  )
  const ticketUrl = sponsorTicketUrl(conference)
  const codes = resolved.codes.map((c) => c.code)
  return {
    ...resolved,
    html: discountCodesCardHtml({ codes, ticketUrl, theme: conference.theme }),
    attachments: discountCodeAttachments(codes, ticketUrl),
  }
}

async function getSponsorForCurrentConference(id: string) {
  const conferenceId = await resolveConferenceId()
  const result = await getSponsorForConference(id)
  if (
    result.sponsorForConference &&
    result.sponsorForConference.conference?._id !== conferenceId
  ) {
    return { error: new Error('Not authorized for this conference') }
  }
  return result
}

/**
 * TENANCY — FAILS CLOSED. `conferenceId` used to be optional and the query
 * degraded to `*[_type == "sponsorTier"]` when it was falsy, returning every
 * tenant's tiers (and their PRICING) to whichever admin surface asked. The
 * predicate is now unconditional and an unresolvable tenant issues no query.
 */
async function getAllSponsorTiers(conferenceId: string): Promise<{
  sponsorTiers?: SponsorTierExisting[]
  error?: Error
}> {
  if (!conferenceId) {
    return {
      error: new Error(
        'getAllSponsorTiers: refusing to run without a resolved conference',
      ),
    }
  }

  try {
    const sponsorTiers = await scopedFetch<SponsorTierExisting[]>(
      clientWrite,
      { conferenceId },
      `*[_type == "sponsorTier"]{
        _id,
        _createdAt,
        _updatedAt,
        title,
        tagline,
        tierType,
        price[]{
          _key,
          amount,
          currency
        },
        perks[]{
          _key,
          label,
          description
        },
        soldOut,
        mostPopular,
        maxQuantity,
        ticketEntitlement
      }`,
    )

    return { sponsorTiers }
  } catch (error) {
    return { error: error as Error }
  }
}

async function sendContractSignedSlackNotification(
  sfcId: string,
  sfc: {
    sponsor?: { name?: string }
    signerName?: string
    tier?: { title?: string }
    contractValue?: number
    contractCurrency?: string
    // `organization` is load-bearing: `resolveConferenceSlackToken` keys the bot
    // token on it, and dropping it resolves NO token and silently kills this post.
    conference?: {
      _id?: string
      domains?: string[]
      organization?: { _ref?: string } | null
    }
  },
) {
  try {
    const salesChannel = sfc.conference?._id
      ? await clientReadUncached.fetch<string | null>(
          `*[_type == "conference" && _id == $id][0].salesNotificationChannel`,
          { id: sfc.conference._id },
        )
      : null

    if (!salesChannel) return

    const { notifySponsorContractSigned } = await import('@/lib/slack/notify')
    await notifySponsorContractSigned(
      sfc.sponsor?.name || 'Unknown Sponsor',
      sfc.signerName,
      sfc.tier?.title || null,
      sfc.contractValue ?? null,
      sfc.contractCurrency ?? null,
      {
        ...sfc.conference,
        salesNotificationChannel: salesChannel,
      } as Parameters<typeof notifySponsorContractSigned>[5],
    )
  } catch (slackError) {
    console.error(
      `[sendContractSignedSlackNotification] Failed for ${sfcId}:`,
      slackError,
    )
  }
}

/**
 * Reported when a closed-won record carries a tier id that no longer resolves
 * to a real tier (a dangling reference). The state-machine truthiness check
 * accepts any non-empty id, so create/update verify existence separately and
 * raise this so the organizer fixes the ref rather than silently hiding the
 * sponsor from the public site.
 */
const DANGLING_TIER_MISSING = [
  {
    field: 'tier',
    label: 'Sponsor tier',
    source: 'pipeline' as const,
    severity: 'required' as const,
    message:
      'The selected sponsor tier no longer exists. Choose a valid tier before marking as Won.',
  },
]

/** Throws a PRECONDITION_FAILED with the blocking fields when a guard rejects. */
function assertGuard(result: TransitionResult): void {
  if (!result.ok) throw preconditionFailed(result.missing)
}

/**
 * Rejects a Won record whose tier reference doesn't resolve. The synchronous
 * state-machine guard only checks truthiness, so a non-empty id pointing at a
 * deleted tier needs this existence round-trip. No-op for non-Won states or a
 * cleared tier (those are handled by the truthiness guard).
 */
async function assertTierResolvable(
  status: string,
  tierRef: string | undefined,
): Promise<void> {
  if (status === 'closed-won' && tierRef && !(await tierExists(tierRef))) {
    throw preconditionFailed(DANGLING_TIER_MISSING)
  }
}

/**
 * REFERENCE-INJECTION GUARD for the CRM pipeline record (#863, the #731 F1/F4
 * shape).
 *
 * `crm.create` / `crm.update` write four client-supplied ids into reference
 * fields of a `sponsorForConference` this org DOES own: `sponsor`, `tier`,
 * `addons[]` and `contractTemplate`. No foreign document is patched, so the
 * existing `requireDocument*` guards on the record itself never saw these — but
 * every scoped view that reads the record DEREFERENCES them. A foreign
 * `sponsor` puts another tenant's company name, org number and address into this
 * tenant's pipeline list, board and CSV exports; a foreign `tier` puts their
 * pricing there and, via `contractTemplate`, their contract terms into the PDF
 * this conference sends out. `assertTierResolvable` was the only check in place
 * and it only ever asked whether the id EXISTS — dataset-wide, which for a
 * dataset-wide key is no check at all.
 *
 * Each id is proved on its OWN type's boundary: `sponsor` is org-owned (as
 * `sponsor.getById`/`update`/`delete` already treat it), tiers, add-ons — which
 * are `sponsorTier` documents too — and contract templates are conference-owned.
 * A nonexistent id and another tenant's id both refuse as NOT_FOUND, so this
 * adds no existence oracle. Add-ons go through the PLURAL form, which refuses the
 * whole array unless every id is ours: a partial apply would write the foreign
 * half of the request while reporting success.
 */
async function assertCrmReferencesAreOurs(refs: {
  sponsor?: string
  tier?: string | null
  addons?: string[]
  contractTemplate?: string | null
}): Promise<void> {
  if (refs.sponsor) {
    await requireDocumentInCurrentOrg(refs.sponsor, 'sponsor')
  }
  if (refs.tier) {
    await requireDocumentInCurrentConference(refs.tier, 'sponsorTier')
  }
  if (refs.addons && refs.addons.length > 0) {
    await requireDocumentsInCurrentConference(refs.addons, 'sponsorTier')
  }
  if (refs.contractTemplate) {
    await requireDocumentInCurrentConference(
      refs.contractTemplate,
      'contractTemplate',
    )
  }
}

/**
 * A Bluesky handle the save sets (tagging spec §3.3): asked of Bluesky only
 * when it is new — a save that keeps the stored handle asks nothing. Refuses
 * on a definite "no such handle"; an unreachable Bluesky is a warning.
 */
async function blueskyHandleWarnings(
  next: string | null | undefined,
  stored?: string | null,
): Promise<string[]> {
  if (!next || next === stored) return []
  const check = await checkSponsorBlueskyHandle(next)
  if (!check.ok)
    throw new TRPCError({ code: 'BAD_REQUEST', message: check.message })
  return check.warnings
}

/**
 * SE-3: sanitize sponsor logo SVG fields SERVER-SIDE before persistence.
 *
 * Sponsor logos are `inlineSvg` strings uploaded by organizers (SponsorAddModal)
 * AND by sponsors themselves via the public registration portal — the client
 * `sanitizeSvg` pass is defence-in-depth only and is trivially bypassed by a
 * crafted request. This is the authoritative gate: a hard rejection (oversize /
 * non-SVG / entity) becomes a BAD_REQUEST; disallowed content is silently
 * stripped per policy. Only fields actually PRESENT on `data` are touched, so a
 * partial update never wipes a slot it didn't mean to.
 */
/** The social accounts normalised, or a BAD_REQUEST with the sentence. */
function withSponsorSocials<
  T extends { blueskyHandle?: string | null; linkedinUrl?: string | null },
>(data: T): T {
  const parsed = parseSponsorSocials(data)
  if (!parsed.ok)
    throw new TRPCError({ code: 'BAD_REQUEST', message: parsed.message })
  return { ...data, ...parsed.value }
}

function sanitizeSponsorLogoInput<
  T extends { logo?: string | null; logoBright?: string | null },
>(data: T): T {
  const out = { ...data }
  try {
    if ('logo' in data) out.logo = sanitizeSvgFieldOrThrow(data.logo)
    if ('logoBright' in data) {
      out.logoBright = sanitizeSvgFieldOrThrow(data.logoBright)
    }
  } catch (error) {
    if (error instanceof SvgSanitizeError) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })
    }
    throw error
  }
  return out
}

export const sponsorRouter = router({
  list: adminProcedure
    .input(z.object({ query: z.string().optional() }).optional())
    .query(async ({ input }) => {
      try {
        // Scope the sponsor company picker to the current tenant (E10). Both
        // branches (search + full list) are filtered so neither leaks other
        // tenants' sponsors; org-less legacy sponsors still surface. Passing the
        // org here (not deeper) keeps the shared-catalog fallback trivial to
        // restore if the owner decides sponsors stay global.
        const orgRef = await getOrganizationRefForCurrentConference()
        let result
        if (input?.query) {
          result = await searchSponsors(input.query, orgRef)
        } else {
          result = await getAllSponsors(orgRef)
        }

        const { sponsors, error } = result
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch sponsors',
            cause: error,
          })
        }

        return sponsors || []
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process sponsor list request',
          cause: error,
        })
      }
    }),

  getById: adminProcedure.input(IdParamSchema).query(async ({ input }) => {
    // OWNERSHIP (#730): `getSponsor` is unscoped, so this read returned any
    // tenant's sponsor record (name, org number, contacts) and doubled as an
    // existence oracle.
    await requireDocumentInCurrentOrg(input.id, 'sponsor')
    const { sponsor, error } = await getSponsor(input.id)

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch sponsor',
        cause: error,
      })
    }

    if (!sponsor) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Sponsor not found',
      })
    }

    return sponsor
  }),

  create: adminProcedure
    .input(SponsorInputSchema)
    .mutation(async ({ input }) => {
      try {
        const sanitized = withSponsorSocials(sanitizeSponsorLogoInput(input))
        const validationErrors = validateSponsor(sanitized)
        if (validationErrors.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Sponsor contains invalid fields',
            cause: { validationErrors },
          })
        }

        const warnings = await blueskyHandleWarnings(sanitized.blueskyHandle)
        const { sponsor, error } = await createSponsor(sanitized)
        if (error || !sponsor) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create sponsor',
            cause: error,
          })
        }

        return { ...sponsor, warnings } satisfies SponsorSaveResult
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process sponsor creation request',
          cause: error,
        })
      }
    }),

  update: adminProcedure
    .input(IdParamSchema.extend({ data: SponsorUpdateSchema }))
    .mutation(async ({ input }) => {
      try {
        // OWNERSHIP (#730): `getSponsor` checks `_type` but NOT the tenant, so
        // this is the whole control. It sits ABOVE the empty-`data` branch:
        // inside the `if`, `update({ id, data: {} })` skipped it entirely and
        // returned any tenant's sponsor record — a cross-tenant read AND an
        // existence oracle in a procedure marked as guarded.
        await requireDocumentInCurrentOrg(input.id, 'sponsor')
        if (Object.keys(input.data).length > 0) {
          const { sponsor: existingSponsor } = await getSponsor(input.id)
          if (!existingSponsor) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Sponsor not found',
            })
          }

          // Only what this request changes is written: the Bluesky check
          // below can take seconds, and a patch rebuilt from the read above
          // would put back an edit someone else made meanwhile.
          const changes = withSponsorSocials(
            sanitizeSponsorLogoInput(input.data),
          )
          const mergedData = { ...existingSponsor, ...changes }
          const validationErrors = validateSponsor(mergedData)
          if (validationErrors.length > 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Sponsor contains invalid fields',
              cause: { validationErrors },
            })
          }
          const warnings = await blueskyHandleWarnings(
            changes.blueskyHandle,
            existingSponsor.blueskyHandle,
          )

          const { sponsor, error } = await updateSponsor(input.id, changes)

          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to update sponsor',
              cause: error,
            })
          }

          if (!sponsor) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Sponsor not found',
            })
          }

          return { ...sponsor, warnings } satisfies SponsorSaveResult
        } else {
          const { sponsor } = await getSponsor(input.id)
          if (!sponsor) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Sponsor not found',
            })
          }
          return { ...sponsor, warnings: [] } satisfies SponsorSaveResult
        }
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process sponsor update request',
          cause: error,
        })
      }
    }),

  delete: adminProcedure
    .input(IdParamSchema)
    .mutation(async ({ input, ctx }) => {
      // OWNERSHIP (#730): unguarded, this deleted any sponsor in the dataset
      // and cascaded into every `sponsorForConference` referencing it.
      //
      // Guarded at BOTH layers deliberately. The router guard also constrains
      // `_type`, so a non-sponsor id cannot be routed here at all; the data
      // layer re-proves ownership from `ctx.orgId` — the org the admin
      // procedure already gated on, never anything derived from `input`.
      await requireDocumentInCurrentOrg(input.id, 'sponsor')
      const { error } = await deleteSponsor(input.id, ctx.orgId)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete sponsor',
          cause: error,
        })
      }

      return { success: true }
    }),

  tiers: router({
    list: adminProcedure.query(async () => {
      // Scope to the current conference (E5): sponsorTier carries conference._ref
      // (the tenant boundary), so an unscoped read leaked every tenant's tiers.
      const conferenceId = await resolveConferenceId()
      const { sponsorTiers, error } = await getAllSponsorTiers(conferenceId)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch sponsor tiers',
          cause: error,
        })
      }

      return sponsorTiers || []
    }),

    listByConference: adminProcedure.query(async () => {
      const conferenceId = await resolveConferenceId()
      const { sponsorTiers, error } = await getAllSponsorTiers(conferenceId)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch sponsor tiers for conference',
          cause: error,
        })
      }

      return sponsorTiers || []
    }),

    getById: adminProcedure.input(IdParamSchema).query(async ({ input }) => {
      // OWNERSHIP (#730): `getSponsorTier` is unscoped — same existence-oracle
      // shape as `sponsor.getById`.
      await requireDocumentInCurrentConference(input.id, 'sponsorTier')
      const { sponsorTier, error } = await getSponsorTier(input.id)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch sponsor tier',
          cause: error,
        })
      }

      if (!sponsorTier) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Sponsor tier not found',
        })
      }

      return sponsorTier
    }),

    create: adminProcedure
      .input(SponsorTierInputSchema)
      .mutation(async ({ input }) => {
        const { conference, error: confError } =
          await getConferenceForCurrentDomain()
        if (confError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: confError,
          })
        }

        const dataWithConference = { ...input, conference: conference._id }
        const validationErrors = validateSponsorTier(dataWithConference)
        if (validationErrors.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Sponsor tier contains invalid fields',
            cause: { validationErrors },
          })
        }

        const { sponsorTier, error } =
          await createSponsorTier(dataWithConference)
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create sponsor tier',
            cause: error,
          })
        }

        // Sponsor tiers belong to one conference — bust only this tenant.
        revalidateTag(conferenceTag(conference._id), 'default')

        return sponsorTier
      }),

    update: adminProcedure
      .input(IdParamSchema.extend({ data: SponsorTierUpdateSchema }))
      .mutation(async ({ input }) => {
        // OWNERSHIP (#730): `getSponsorTier` is unscoped. ABOVE the empty-`data`
        // branch — see `sponsor.update` for why.
        await requireDocumentInCurrentConference(input.id, 'sponsorTier')
        if (Object.keys(input.data).length > 0) {
          const { sponsorTier: existingTier } = await getSponsorTier(input.id)
          if (!existingTier) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Sponsor tier not found',
            })
          }

          const mergedData = {
            ...existingTier,
            ...input.data,
            maxQuantity:
              input.data.maxQuantity === null
                ? undefined
                : (input.data.maxQuantity ?? existingTier.maxQuantity),
            // Same three-way merge as `maxQuantity`: an explicit `null` CLEARS
            // the tier's complimentary-ticket count, an omitted key keeps what
            // is already stored. Collapsing those would make a partial update
            // silently wipe the allocation.
            ticketEntitlement:
              input.data.ticketEntitlement === null
                ? undefined
                : (input.data.ticketEntitlement ??
                  existingTier.ticketEntitlement),
          }
          const validationErrors = validateSponsorTier(mergedData)
          if (validationErrors.length > 0) {
            console.error('Sponsor tier validation errors:', validationErrors)
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Sponsor tier contains invalid fields',
              cause: { validationErrors },
            })
          }

          const { sponsorTier, error } = await updateSponsorTier(
            input.id,
            mergedData,
          )

          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to update sponsor tier',
              cause: error,
            })
          }

          if (!sponsorTier) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Sponsor tier not found',
            })
          }

          // Sponsor tiers belong to one conference — bust only this tenant.
          revalidateTag(conferenceTag(await resolveConferenceId()), 'default')

          return sponsorTier
        } else {
          const { sponsorTier } = await getSponsorTier(input.id)
          if (!sponsorTier) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Sponsor tier not found',
            })
          }
          return sponsorTier
        }
      }),

    delete: adminProcedure.input(IdParamSchema).mutation(async ({ input }) => {
      // OWNERSHIP (#730): unguarded, this deleted any tier in the dataset and
      // unset `tier` on every sponsorForConference referencing it. Guarded at
      // both layers — the router constrains `_type`, the data layer resolves
      // the id inside the request's conference and refuses otherwise.
      await requireDocumentInCurrentConference(input.id, 'sponsorTier')
      const conferenceId = await resolveConferenceId()
      const { error } = await deleteSponsorTier(input.id, conferenceId)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete sponsor tier',
          cause: error,
        })
      }

      // Sponsor tiers belong to one conference — bust only this tenant.
      revalidateTag(conferenceTag(conferenceId), 'default')

      return { success: true }
    }),
  }),

  crm: router({
    listOrganizers: adminProcedure.query(async () => {
      const conferenceId = await resolveConferenceId()
      const { getOrganizersByConference } = await import('@/lib/speaker/sanity')

      const { speakers, err } = await getOrganizersByConference(conferenceId)

      if (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list organizers',
          cause: err,
        })
      }

      return (
        speakers?.map((s) => ({
          _id: s._id,
          name: s.name,
          email: s.email,
          avatar: s.image,
        })) || []
      )
    }),

    /**
     * Bare count for a set of pipeline stages — used for "showing X of Y"
     * result lines so a page does not refetch the full expanded list just to
     * size the total. Status only; see `countSponsorsForConference`.
     */
    count: adminProcedure
      .input(z.object({ status: z.array(z.string()).optional() }).optional())
      .query(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const { count, error } = await countSponsorsForConference(
          conferenceId,
          input?.status,
        )

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to count sponsors for conference',
            cause: error,
          })
        }

        return count ?? 0
      }),

    list: adminProcedure
      .input(SponsorCRMFilterSchema.optional())
      .query(async ({ input, ctx }) => {
        const conferenceId = await resolveConferenceId()

        let status = input?.status
        const invoiceStatus = input?.invoiceStatus
        const view = input?.view || 'pipeline'

        if (view === 'invoice') {
          status = ['closed-won']
        } else if (view === 'contract') {
          status = ['closed-won']
        }

        const assignedTo = input?.myAssignedOnly
          ? ctx.speaker._id
          : input?.assignedTo

        const { sponsors, error } = await listSponsorsForConference(
          conferenceId,
          {
            status,
            invoiceStatus,
            assignedTo,
            assignedToIds: input?.assignedToIds,
            unassignedOnly: input?.unassignedOnly,
            tags: input?.tags,
            tiers: input?.tiers,
            searchQuery: input?.searchQuery,
          },
        )

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to list sponsors for conference',
            cause: error,
          })
        }

        let filtered = sponsors || []

        // Apply view-specific filters that are hard to do in GROQ
        if (view === 'invoice') {
          filtered = filtered.filter((s) => s.contractValue != null)
        }

        // Filter by stale days (no activity in N days)
        if (input?.staleDays) {
          const cutoff = Date.now() - input.staleDays * 24 * 60 * 60 * 1000
          filtered = filtered.filter((s) => {
            const lastAt = s.lastActivity?.createdAt || s._updatedAt
            return new Date(lastAt).getTime() < cutoff
          })
        }

        // Filter: only sponsors missing contact info
        if (input?.hasContactInfo === false) {
          filtered = filtered.filter(
            (s) => !s.contactPersons || s.contactPersons.length === 0,
          )
        } else if (input?.hasContactInfo === true) {
          filtered = filtered.filter(
            (s) => s.contactPersons && s.contactPersons.length > 0,
          )
        }

        // Filter: billing complete enough to invoice (see evaluateBilling —
        // spans the sponsor document, so it cannot live in the GROQ filter)
        if (input?.billingComplete !== undefined) {
          filtered = filtered.filter(
            (s) => isBillingComplete(s) === input.billingComplete,
          )
        }

        // Filter: ready to invoice as recorded (billing + amount + signature)
        if (input?.invoiceReady !== undefined) {
          filtered = filtered.filter(
            (s) => evaluateInvoiceReadiness(s).ready === input.invoiceReady,
          )
        }

        // Filter: follow-up due (scheduled date has passed)
        if (input?.followUpDue) {
          const now = new Date()
          filtered = filtered.filter(
            (s) => s.nextFollowUpAt && new Date(s.nextFollowUpAt) <= now,
          )
        }

        // Filter: has a follow-up scheduled
        if (input?.hasFollowUp === true) {
          filtered = filtered.filter((s) => !!s.nextFollowUpAt)
        } else if (input?.hasFollowUp === false) {
          filtered = filtered.filter((s) => !s.nextFollowUpAt)
        }

        // Apply sorting
        const sortBy = input?.sortBy
        const sortOrder = input?.sortOrder || 'desc'
        if (sortBy) {
          filtered.sort((a, b) => {
            let cmp = 0
            switch (sortBy) {
              case 'lastActivity': {
                const aTime = a.lastActivity?.createdAt || a._updatedAt
                const bTime = b.lastActivity?.createdAt || b._updatedAt
                cmp = new Date(aTime).getTime() - new Date(bTime).getTime()
                break
              }
              case 'value':
                cmp = (a.contractValue || 0) - (b.contractValue || 0)
                break
              case 'stale': {
                const aStale = a.lastActivity?.createdAt || a._updatedAt
                const bStale = b.lastActivity?.createdAt || b._updatedAt
                cmp = new Date(aStale).getTime() - new Date(bStale).getTime()
                break
              }
              case 'name':
                cmp = (a.sponsor?.name || '').localeCompare(
                  b.sponsor?.name || '',
                )
                break
              case 'createdAt':
                cmp =
                  new Date(a._createdAt).getTime() -
                  new Date(b._createdAt).getTime()
                break
              case 'followUp': {
                const aFu = a.nextFollowUpAt || '9999-12-31'
                const bFu = b.nextFollowUpAt || '9999-12-31'
                cmp = new Date(aFu).getTime() - new Date(bFu).getTime()
                break
              }
            }
            return sortOrder === 'desc' ? -cmp : cmp
          })
        }

        return filtered
      }),

    // Data-health surface: every sponsor currently breaking a state-machine
    // invariant, across all axes. Audits the FULL conference roster (no
    // filters) so the panel can never hide a violation, and reuses the shared
    // guard predicates so it stays in sync as new guards land.
    healthViolations: adminProcedure.query(async () => {
      const conferenceId = await resolveConferenceId()

      const { sponsors, error } = await listSponsorsForConference(conferenceId)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list sponsors for conference',
          cause: error,
        })
      }

      return auditSponsorHealth(sponsors || [])
    }),

    getById: adminProcedure.input(SponsorIdSchema).query(async ({ input }) => {
      const { sponsorForConference, error } =
        await getSponsorForCurrentConference(input.id)

      if (error) {
        throw new TRPCError({
          code: error.message.includes('not found')
            ? 'NOT_FOUND'
            : 'INTERNAL_SERVER_ERROR',
          message: error.message,
          cause: error,
        })
      }

      return sponsorForConference
    }),

    create: adminProcedure
      .input(SponsorForConferenceInputSchema)
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.speaker._id
        const resolvedConferenceId = await resolveConferenceId()
        const data = {
          ...input,
          conference: resolvedConferenceId,
          tags: input.tags as SponsorTag[] | undefined,
        }

        // OWNERSHIP of every reference this record will carry (#863), before any
        // read or write touches them.
        await assertCrmReferencesAreOurs(data)

        // Note: This is a check-then-act pattern. Sanity does not support
        // atomic transactions, so two concurrent requests could both pass this
        // check before either creates the record. In practice this is
        // acceptable: the UI disables the button after first click, and a
        // duplicate would be immediately visible to the organizer to delete.
        const existingSponsorForConference = await clientReadUncached.fetch(
          `*[_type == "sponsorForConference" && sponsor._ref == $sponsor && conference._ref == $conference][0]`,
          { sponsor: data.sponsor, conference: data.conference },
        )

        if (existingSponsorForConference) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'This sponsor is already in the pipeline for this conference.',
          })
        }

        // Enforce the pipeline invariant however the record is created, not
        // just on drag-drop moves (closed-won requires a tier that resolves).
        assertGuard(checkPipelineState(data.status, { tier: data.tier }))
        await assertTierResolvable(data.status, data.tier)

        // Enforce invoice guards
        if (data.invoiceStatus && data.invoiceStatus !== 'not-sent') {
          const transition = canTransition(
            'invoice',
            'not-sent',
            data.invoiceStatus,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data as any,
          )
          if (!transition.ok) {
            throw preconditionFailed(transition.missing)
          }
        }

        // Auto-assign to current user if not provided (undefined)
        if (data.assignedTo === undefined && userId) {
          data.assignedTo = userId
        }

        // Ensure assigned person is an organizer of this conference
        if (data.assignedTo) {
          const { getOrganizersByConference } =
            await import('@/lib/speaker/sanity')
          const { speakers: organizers } =
            await getOrganizersByConference(resolvedConferenceId)
          if (!organizers?.some((o) => o._id === data.assignedTo)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Assigned person must be an organizer of this conference',
            })
          }
        }

        const { sponsorForConference, error } =
          await createSponsorForConference(data as SponsorForConferenceInput)

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create sponsor relationship',
            cause: error,
          })
        }

        if (sponsorForConference && userId) {
          try {
            await logSponsorCreated(sponsorForConference._id, userId)
          } catch (logError) {
            console.error('Failed to log sponsor created activity:', logError)
          }
        }

        if (sponsorForConference) {
          await publishSponsorStatusChange({
            conferenceId: resolvedConferenceId,
            sponsorForConferenceId: sponsorForConference._id,
            previous: {},
            next: {
              status: data.status ?? null,
              contractStatus: data.contractStatus ?? null,
            },
            source: 'crm.create',
            triggeredBy: userId,
          })
        }

        return sponsorForConference
      }),

    update: adminProcedure
      .input(SponsorForConferenceUpdateSchema)
      .mutation(async ({ input, ctx }) => {
        const { id, ...updateData } = input

        // OWNERSHIP of every reference this edit would write (#863). `sponsor`
        // is not editable here, but `tier`, `addons[]` and `contractTemplate`
        // are — and they are refused before the record is even read.
        await assertCrmReferencesAreOurs(updateData)

        // Fetch existing data for change detection
        const { sponsorForConference: existing } =
          await getSponsorForCurrentConference(id)

        if (!existing) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
          })
        }

        // Enforce the pipeline invariant when an edit changes status or tier (a
        // field edit can reach closed-won, or clear the tier of a closed-won
        // sponsor, without going through moveStage). Only guard when one of
        // those actually changes, so unrelated edits to a pre-existing invalid
        // record aren't trapped — that back-catalog is cleaned in #379.
        const statusChanging =
          updateData.status !== undefined &&
          updateData.status !== existing.status
        const tierChanging = updateData.tier !== undefined
        if (statusChanging || tierChanging) {
          const resultingStatus = updateData.status ?? existing.status
          const resultingTier =
            updateData.tier !== undefined ? updateData.tier : existing.tier
          assertGuard(
            checkPipelineState(resultingStatus, { tier: resultingTier }),
          )
          // A freshly-supplied tier id is an unresolved string here (unlike the
          // dereferenced existing.tier), so verify it points at a real tier.
          if (tierChanging) {
            await assertTierResolvable(resultingStatus, updateData.tier)
          }
        }

        const invoiceStatusChanging =
          updateData.invoiceStatus !== undefined &&
          updateData.invoiceStatus !== existing.invoiceStatus

        if (invoiceStatusChanging) {
          const resultingState = { ...existing, ...updateData }
          const transition = canTransition(
            'invoice',
            existing.invoiceStatus || 'not-sent',
            updateData.invoiceStatus!,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resultingState as any,
          )
          if (!transition.ok) {
            throw preconditionFailed(transition.missing)
          }

          // Handle timestamp side-effects
          if (updateData.invoiceStatus === 'sent' && !existing.invoiceSentAt) {
            updateData.invoiceSentAt = getCurrentDateTime()
          }
          if (updateData.invoiceStatus === 'paid' && !existing.invoicePaidAt) {
            updateData.invoicePaidAt = getCurrentDateTime()
          }
          if (updateData.invoiceStatus !== 'paid') {
            updateData.invoicePaidAt = null
          }
          if (
            updateData.invoiceStatus === 'not-sent' ||
            updateData.invoiceStatus === 'cancelled'
          ) {
            updateData.invoiceSentAt = null
          }
        }

        // Ensure assigned person is an organizer of this conference
        if (updateData.assignedTo) {
          const conferenceId = await resolveConferenceId()
          const { getOrganizersByConference } =
            await import('@/lib/speaker/sanity')
          const { speakers: organizers } =
            await getOrganizersByConference(conferenceId)
          if (!organizers?.some((o) => o._id === updateData.assignedTo)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Assigned person must be an organizer of this conference',
            })
          }
        }

        const { sponsorForConference, error } =
          await updateSponsorForConference(id, {
            ...updateData,
            tags: updateData.tags as SponsorTag[] | undefined,
          })

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update sponsor relationship',
            cause: error,
          })
        }

        await publishSponsorStatusChange({
          conferenceId: existing.conference._id,
          sponsorForConferenceId: id,
          previous: existing,
          next: {
            status: updateData.status,
            contractStatus: updateData.contractStatus,
          },
          source: 'crm.update',
          triggeredBy: ctx.speaker._id,
        })

        // Log activity for key field changes
        const userId = ctx.speaker._id
        if (userId) {
          try {
            if (updateData.status && updateData.status !== existing.status) {
              await logStageChange(
                id,
                existing.status,
                updateData.status,
                userId,
              )
            }

            if (
              updateData.invoiceStatus &&
              updateData.invoiceStatus !== existing.invoiceStatus
            ) {
              await logInvoiceStatusChange(
                id,
                existing.invoiceStatus,
                updateData.invoiceStatus,
                userId,
              )
            }

            if (
              updateData.contractStatus &&
              updateData.contractStatus !== existing.contractStatus
            ) {
              await logContractStatusChange(
                id,
                existing.contractStatus,
                updateData.contractStatus,
                userId,
              )
            }

            if (
              updateData.assignedTo !== undefined &&
              updateData.assignedTo !== (existing.assignedTo?._id || null)
            ) {
              let assigneeName: string | null = null
              if (updateData.assignedTo) {
                try {
                  const { getSpeaker } = await import('@/lib/speaker/sanity')
                  const { speaker } = await getSpeaker(updateData.assignedTo)
                  assigneeName = speaker?.name || updateData.assignedTo
                } catch (lookupError) {
                  console.error('Failed to lookup assignee name:', lookupError)
                  assigneeName = updateData.assignedTo
                }
              }
              await logAssignmentChange(id, assigneeName, userId)
            }
          } catch (logError) {
            console.error('Failed to log activity:', logError)
          }
        }

        return sponsorForConference
      }),

    moveStage: adminProcedure
      .input(MoveStageSchema)
      .mutation(async ({ input, ctx }) => {
        const { sponsorForConference: existing } =
          await getSponsorForCurrentConference(input.id)

        if (!existing) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
          })
        }

        const oldStatus = existing.status

        assertGuard(
          canTransition('pipeline', existing.status, input.newStatus, existing),
        )

        const { sponsorForConference, error } =
          await updateSponsorForConference(input.id, {
            status: input.newStatus,
          })

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update sponsor status',
            cause: error,
          })
        }

        await publishSponsorStatusChange({
          conferenceId: existing.conference._id,
          sponsorForConferenceId: input.id,
          previous: existing,
          next: { status: input.newStatus },
          source: 'crm.moveStage',
          triggeredBy: ctx.speaker._id,
        })

        const userId = ctx.speaker._id
        if (userId && oldStatus !== input.newStatus) {
          try {
            await logStageChange(input.id, oldStatus, input.newStatus, userId)
          } catch (logError) {
            console.error('Failed to log stage change activity:', logError)
          }

          // Notify organizers (except the actor) of the stage move. Shares
          // createNotifications' never-fail contract: the move is already
          // persisted, so a failure here (e.g. the organizer-id fetch) must not
          // surface as a moveStage error.
          try {
            const conferenceId = existing.conference?._id
            if (conferenceId) {
              const sponsorName = existing.sponsor?.name
              // TEAMS-2: sponsor events route to the `sponsors` team (all
              // organizers when it is not configured — the shared fallback).
              const organizerIds = await resolveRoutedOrganizerIds({
                conferenceId,
                teamKey: 'sponsors',
              })
              await createNotifications(
                organizerIds
                  .filter((id) => id && id !== userId)
                  .map((id): NotificationInput => ({
                    recipientId: id,
                    conferenceId,
                    notificationType: 'sponsor_activity',
                    title: sponsorName
                      ? `Sponsor ${sponsorName} moved to ${input.newStatus}`
                      : `Sponsor moved to ${input.newStatus}`,
                    actorId: userId,
                    link: `/admin/sponsors/crm?sponsor=${input.id}`,
                  })),
              )
            }
          } catch (notifyError) {
            console.error(
              'Failed to notify organizers of sponsor stage move:',
              notifyError,
            )
          }
        }

        return sponsorForConference
      }),

    updateInvoiceStatus: adminProcedure
      .input(UpdateInvoiceStatusSchema)
      .mutation(async ({ input, ctx }) => {
        const { sponsorForConference: existing } =
          await getSponsorForCurrentConference(input.id)

        if (!existing) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
          })
        }

        const oldStatus = existing.invoiceStatus

        const transition = canTransition(
          'invoice',
          oldStatus,
          input.newStatus,
          existing,
        )
        if (!transition.ok) {
          throw preconditionFailed(transition.missing)
        }
        const updateData: Partial<{
          invoiceStatus: string
          invoiceSentAt: string | null
          invoicePaidAt: string | null
        }> = {
          invoiceStatus: input.newStatus,
        }

        if (input.newStatus === 'sent' && !existing.invoiceSentAt) {
          updateData.invoiceSentAt = getCurrentDateTime()
        }
        if (input.newStatus === 'paid' && !existing.invoicePaidAt) {
          updateData.invoicePaidAt = getCurrentDateTime()
        }

        if (input.newStatus !== 'paid') {
          updateData.invoicePaidAt = null
        }
        if (input.newStatus === 'not-sent' || input.newStatus === 'cancelled') {
          updateData.invoiceSentAt = null
        }

        const { sponsorForConference, error } =
          await updateSponsorForConference(
            input.id,
            updateData as Partial<SponsorForConferenceInput>,
          )

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update invoice status',
            cause: error,
          })
        }

        const userId = ctx.speaker._id
        if (userId && oldStatus !== input.newStatus) {
          try {
            await logInvoiceStatusChange(
              input.id,
              oldStatus,
              input.newStatus,
              userId,
            )
          } catch (logError) {
            console.error(
              'Failed to log invoice status change activity:',
              logError,
            )
          }
        }

        return sponsorForConference
      }),

    sendContractInvite: adminProcedure
      .input(
        z.object({
          sponsorForConferenceId: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        await requireDocumentInCurrentConference(
          input.sponsorForConferenceId,
          'sponsorForConference',
        )

        const { sponsorForConference: sfc, error } =
          await getSponsorForCurrentConference(input.sponsorForConferenceId)

        if (error || !sfc) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
            cause: error,
          })
        }

        if (!sfc.conference) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Conference not found',
          })
        }

        if (!sfc.sponsor?.name) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Sponsor information is missing.',
          })
        }

        if (sfc.signatureStatus !== 'pending' || !sfc.signatureId) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Contract is not currently pending signature.',
          })
        }

        if (!sfc.signingUrl) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'No signing URL found. Generate and send the contract first.',
          })
        }

        const signerEmail = sfc.signerEmail
        if (!signerEmail) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'No signer email defined. Cannot send email.',
          })
        }

        const { domain: currentDomain } = await getConferenceForCurrentDomain()
        if (!currentDomain) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Conference has no domain configured.',
          })
        }

        const { isLocalhostDomain } =
          await import('@/lib/environment/localhost')
        if (isLocalhostDomain(currentDomain)) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'Contract signing emails cannot be sent from localhost. Deploy to a production domain first.',
          })
        }

        const { renderContractEmail, CONTRACT_EMAIL_SLUGS } =
          await import('@/lib/email/contract-email')
        const { resolveEmailSender, retryWithBackoff } =
          await import('@/lib/email/config')
        const { formatNumber } = await import('@/lib/format')
        const { resolveConferenceFrom } = await import('@/lib/email/from')

        const contractValueStr = sfc.contractValue
          ? `${formatNumber(sfc.contractValue)} ${sfc.contractCurrency || 'NOK'}`
          : undefined

        const result = await renderContractEmail(
          CONTRACT_EMAIL_SLUGS.SENT,
          {
            sponsorName: sfc.sponsor.name,
            signerName: sfc.signerName || sfc.sponsor.name,
            signerEmail: signerEmail,
            tierName: sfc.tier?.title,
            contractValue: contractValueStr,
            conference: {
              title: sfc.conference.title,
              city: sfc.conference.city,
              startDate: sfc.conference.startDate,
              domains: sfc.conference.domains,
              organizer: sfc.conference.organizer,
              sponsorEmail: sfc.conference.sponsorEmail,
              socialLinks: sfc.conference.socialLinks,
              theme: sfc.conference.theme,
            },
          },
          {
            button: {
              text: 'Review &amp; Sign Agreement',
              href: sfc.signingUrl,
            },
          },
        )

        if (!result) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Contract email template not found',
          })
        }

        const from = resolveConferenceFrom(sfc.conference, {
          field: 'sponsorEmail',
          localPart: 'sponsors',
        })

        const { client } = await resolveEmailSender(ctx.orgId)

        const sendResult = await retryWithBackoff(async () => {
          return client.emails.send({
            from,
            to: [signerEmail],
            subject: result.subject,
            react: result.react,
          })
        })

        if (sendResult.error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to send email: ${sendResult.error.message}`,
          })
        }

        try {
          const { logEmailSent } = await import('@/lib/sponsor-crm/activity')
          await logEmailSent(
            input.sponsorForConferenceId,
            `Sponsorship Agreement — ${sfc.conference!.title}`,
            ctx.speaker._id,
          )
        } catch (logError) {
          console.error('Failed to log email activity:', logError)
        }

        return { success: true }
      }),

    updateContractStatus: adminProcedure
      .input(UpdateContractStatusSchema)
      .mutation(async ({ input, ctx }) => {
        const { sponsorForConference: existing } =
          await getSponsorForCurrentConference(input.id)

        if (!existing) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
          })
        }

        // Contract-axis guards: contract-sent / contract-signed carry required
        // field invariants (tier + value, plus a primary contact to sign, and
        // no contracts on dead deals). Enforced here so a manual/offline status
        // change is held to the same standard as the in-app send flow.
        assertGuard(
          canTransition(
            'contract',
            existing.contractStatus,
            input.newStatus,
            existing,
          ),
        )

        const oldStatus = existing.contractStatus
        const updateData: Partial<{
          contractStatus: string
          contractSignedAt: string | null
        }> = {
          contractStatus: input.newStatus,
        }

        if (
          input.newStatus === 'contract-signed' &&
          !existing.contractSignedAt
        ) {
          updateData.contractSignedAt = getCurrentDateTime()
        }

        const { sponsorForConference, error } =
          await updateSponsorForConference(
            input.id,
            updateData as Partial<SponsorForConferenceInput>,
          )

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update contract status',
            cause: error,
          })
        }

        await publishSponsorStatusChange({
          conferenceId: existing.conference._id,
          sponsorForConferenceId: input.id,
          previous: existing,
          next: { contractStatus: input.newStatus },
          source: 'crm.updateContractStatus',
          triggeredBy: ctx.speaker._id,
        })

        const userId = ctx.speaker._id
        if (userId && oldStatus !== input.newStatus) {
          try {
            await logContractStatusChange(
              input.id,
              oldStatus,
              input.newStatus,
              userId,
            )
          } catch (logError) {
            console.error(
              'Failed to log contract status change activity:',
              logError,
            )
          }
        }

        return sponsorForConference
      }),

    bulkUpdate: adminProcedure
      .input(BulkUpdateSponsorCRMSchema)
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.speaker._id
        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User ID not found in session',
          })
        }

        try {
          // OWNERSHIP (#730): `bulkUpdateSponsors` matches on `_id in $ids` with
          // NO conference predicate (its own comment says so), so a mass
          // status/assignee/tag rewrite could span tenants. Refuse the whole
          // batch unless every id is ours.
          await requireDocumentsInCurrentConference(
            input.ids,
            'sponsorForConference',
          )
          // Ensure assigned person is an organizer of this conference
          if (input.assignedTo) {
            const conferenceId = await resolveConferenceId()
            const { getOrganizersByConference } =
              await import('@/lib/speaker/sanity')
            const { speakers: organizers } =
              await getOrganizersByConference(conferenceId)
            if (!organizers?.some((o) => o._id === input.assignedTo)) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message:
                  'Assigned person must be an organizer of this conference',
              })
            }
          }

          // Enforce the pipeline invariant: a record can only be bulk-marked
          // Won if it has a resolvable tier. Reject the whole batch (rather
          // than silently skipping) so the organizer knows which ones to fix.
          if (input.invoiceStatus) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Invoice status cannot be updated in bulk. Please update each sponsor individually to ensure requirements are met.',
            })
          }

          if (input.status === 'closed-won') {
            const tierlessIds = await clientReadUncached.fetch<string[]>(
              `*[_type == "sponsorForConference" && _id in $ids && !defined(tier->_id)]._id`,
              { ids: input.ids },
            )
            if (tierlessIds.length > 0) {
              throw preconditionFailed([
                {
                  field: 'tier',
                  label: 'Sponsor tier',
                  source: 'pipeline',
                  severity: 'required',
                  message: `${tierlessIds.length} selected sponsor(s) have no tier and can't be marked Won. Set a tier first.`,
                },
              ])
            }
          }

          // TENANCY: the bulk write is scoped to the REQUEST's conference, never
          // to anything derived from `input`. `resolveConferenceId` throws
          // NOT_FOUND (a TRPCError, rethrown below) on an unresolvable host.
          return await bulkUpdateSponsors(
            input,
            userId,
            await resolveConferenceId(),
          )
        } catch (error) {
          if (error instanceof TRPCError) throw error
          if (error instanceof BulkTenancyError) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'One or more sponsors were not found in this conference',
            })
          }

          console.error('Bulk update error:', error)
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to perform bulk update',
            cause: error,
          })
        }
      }),

    bulkDelete: adminProcedure
      .input(BulkDeleteSponsorCRMSchema)
      .mutation(async ({ input }) => {
        // OWNERSHIP (#730): the conference-scoped fetch below runs only inside
        // `if (input.cancelAgreements)` and gates nothing — `bulkDeleteSponsors`
        // itself is unscoped. Refuse the whole batch unless every id is ours.
        await requireDocumentsInCurrentConference(
          input.ids,
          'sponsorForConference',
        )
        // Cancel signing agreements if requested
        if (input.cancelAgreements) {
          try {
            const { conference: bulkConf } =
              await getConferenceForCurrentDomain()
            const pendingAgreements = await clientReadUncached.fetch<
              Array<{
                signatureId: string
                signingProvider?: SigningProviderType
              }>
            >(
              `*[_type == "sponsorForConference" && conference._ref == $conferenceId && _id in $ids && signatureStatus == "pending" && defined(signatureId)]{ signatureId, "signingProvider": conference->signingProvider }`,
              { ids: input.ids, conferenceId: bulkConf._id },
            )
            if (pendingAgreements.length > 0) {
              for (const {
                signatureId,
                signingProvider,
              } of pendingAgreements) {
                const provider = getSigningProvider(signingProvider)
                try {
                  await provider.cancelAgreement(signatureId)
                } catch (e) {
                  console.error(
                    `[bulkDelete] Failed to cancel agreement ${signatureId}:`,
                    e,
                  )
                }
              }
            }
          } catch (e) {
            console.error('[bulkDelete] Failed to cancel agreements:', e)
          }
        }

        try {
          // TENANCY: scoped to the REQUEST's conference (see bulkUpdate).
          return await bulkDeleteSponsors(
            input.ids,
            await resolveConferenceId(),
            { deleteContractAssets: input.deleteContractAssets },
          )
        } catch (error) {
          // Preserve refusals: a fail-closed tenancy denial must not surface as
          // a 500, or the guard becomes indistinguishable from a server fault.
          if (error instanceof TRPCError) throw error
          if (error instanceof BulkTenancyError) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'One or more sponsors were not found in this conference',
            })
          }
          console.error('Bulk delete error:', error)
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to perform bulk delete',
            cause: error,
          })
        }
      }),

    delete: adminProcedure
      .input(DeleteSponsorSchema)
      .mutation(async ({ input }) => {
        // OWNERSHIP (#730): same shape as `bulkDelete` — the scoped fetch below
        // lives inside `if (input.cancelAgreement)` and gates nothing.
        await requireDocumentInCurrentConference(
          input.id,
          'sponsorForConference',
        )
        // Cancel signing agreement if requested
        if (input.cancelAgreement) {
          try {
            const { conference: delConf } =
              await getConferenceForCurrentDomain()
            const sfc = await clientReadUncached.fetch<{
              signatureId?: string
              signatureStatus?: string
              signingProvider?: SigningProviderType
            }>(
              `*[_type == "sponsorForConference" && conference._ref == $conferenceId && _id == $id][0]{ signatureId, signatureStatus, "signingProvider": conference->signingProvider }`,
              { id: input.id, conferenceId: delConf._id },
            )
            if (sfc?.signatureId && sfc.signatureStatus === 'pending') {
              const provider = getSigningProvider(sfc.signingProvider)
              try {
                await provider.cancelAgreement(sfc.signatureId)
              } catch (e) {
                console.error(
                  `[delete] Failed to cancel agreement ${sfc.signatureId}:`,
                  e,
                )
              }
            }
          } catch (e) {
            console.error('[delete] Failed to cancel agreement:', e)
          }
        }

        const { error } = await deleteSponsorForConference(input.id, {
          deleteContractAsset: input.deleteContractAsset,
        })

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete sponsor relationship',
            cause: error,
          })
        }

        return { success: true }
      }),

    copyFromPreviousYear: adminProcedure
      .input(CopySponsorsSchema)
      .mutation(async ({ input, ctx }) => {
        // TENANCY (#823): the tenant comes from the authorization waist, never
        // from `input` — both conference ids in it are client-supplied, and the
        // lib re-proves each one against this org before reading any sponsor.
        const { result, error } = await copySponsorsFromPreviousYear({
          ...input,
          organizationId: ctx.orgId,
        })

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to copy sponsors from previous year',
            cause: error,
          })
        }

        return result
      }),

    importAllHistoric: adminProcedure
      .input(ImportAllHistoricSponsorsSchema)
      .mutation(async ({ input, ctx }) => {
        // TENANCY (#823): see `copyFromPreviousYear` above.
        const { result, error } = await importAllHistoricSponsors({
          ...input,
          organizationId: ctx.orgId,
        })

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to import historic sponsors',
            cause: error,
          })
        }

        return result
      }),

    activities: router({
      list: adminProcedure
        .input(
          z.object({
            sponsorForConferenceId: z.string().optional(),
            limit: z.number().optional(),
          }),
        )
        .query(async ({ input }) => {
          if (input.sponsorForConferenceId) {
            // OWNERSHIP (#863). `listActivitiesForSponsor` filters on
            // `sponsorForConference._ref == $sponsorId` and nothing else, so
            // this branch handed an organizer of any tenant another tenant's
            // CRM notes — free-text negotiation history plus the `createdBy`
            // author names. The other branch below was already conference-
            // scoped, and the sibling `activities.create` already guards the
            // same id; only this read did not.
            //
            // Guarded BEFORE the fetch, so the foreign activities never enter
            // the request, and a foreign id refuses identically to a
            // nonexistent one.
            await requireDocumentInCurrentConference(
              input.sponsorForConferenceId,
              'sponsorForConference',
            )
            const { activities, error } = await listActivitiesForSponsor(
              input.sponsorForConferenceId,
              input.limit,
            )

            if (error) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to list activities',
                cause: error,
              })
            }

            return activities || []
          }

          const conferenceId = await resolveConferenceId()
          const { activities, error } = await listActivitiesForConference(
            conferenceId,
            input.limit,
          )

          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to list conference activities',
              cause: error,
            })
          }

          return activities || []
        }),

      /**
       * One sent-communication record IN FULL — the rendered body and the
       * attachments the list projection leaves out (#1261). The read itself
       * is conference-scoped through the parent sponsor, so a foreign or
       * missing id both read as nothing and refuse NOT_FOUND.
       */
      get: adminProcedure
        .input(CommunicationRecordIdSchema)
        .query(async ({ input }) => {
          const conferenceId = await resolveConferenceId()
          const { record, error } = await getCommunicationRecord(
            input.id,
            conferenceId,
          )
          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to load the sent email',
              cause: error,
            })
          }
          if (!record) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Sent email not found',
            })
          }
          return record
        }),

      /** The Communications tab: sends only, by kind, paged (#1261). */
      listCommunications: adminProcedure
        .input(ListCommunicationsSchema)
        .query(async ({ input }) => {
          const conferenceId = await requireDocumentInCurrentConference(
            input.sponsorForConferenceId,
            'sponsorForConference',
          )
          const { items, total, error } = await listCommunicationsForSponsor(
            input.sponsorForConferenceId,
            conferenceId,
            { kind: input.kind, offset: input.offset, limit: input.limit },
          )
          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to list sent emails',
              cause: error,
            })
          }
          return { items: items ?? [], total: total ?? 0 }
        }),

      create: adminProcedure
        .input(CreateSponsorActivitySchema)
        .mutation(async ({ input, ctx }) => {
          const { sponsorForConferenceId, activityType, description } = input
          const createdBy = ctx.speaker._id

          if (!createdBy) {
            throw new TRPCError({
              code: 'UNAUTHORIZED',
              message:
                'You must be logged in as an organizer to add activities',
            })
          }

          // OWNERSHIP (#730): attaching an activity to another tenant's sponsor
          // record also stamps this org's key onto it.
          await requireDocumentInCurrentConference(
            sponsorForConferenceId,
            'sponsorForConference',
          )
          const { activityId, error } = await createSponsorActivity(
            sponsorForConferenceId,
            activityType,
            description,
            createdBy,
          )

          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to create sponsor activity',
              cause: error,
            })
          }

          return { activityId }
        }),

      update: adminProcedure
        .input(UpdateSponsorActivitySchema)
        .mutation(async ({ input, ctx }) => {
          const { success, error } = await updateSponsorActivity(
            input.id,
            ctx.speaker._id,
            input.description,
            input.metadata,
          )

          if (error || !success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error?.message || 'Failed to update sponsor activity',
              cause: error,
            })
          }

          return { success: true }
        }),

      delete: adminProcedure
        .input(IdParamSchema)
        .mutation(async ({ input, ctx }) => {
          const { success, error } = await deleteSponsorActivity(
            input.id,
            ctx.speaker._id,
          )

          if (error || !success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error?.message || 'Failed to delete sponsor activity',
              cause: error,
            })
          }

          return { success: true }
        }),
    }),

    checkSignatureStatus: adminProcedure
      .input(SponsorForConferenceIdSchema)
      .mutation(async ({ input, ctx }) => {
        const logCtx = `[checkSignatureStatus] sfc=${input.id}`

        const { sponsorForConference: sfc, error: sfcError } =
          await getSponsorForCurrentConference(input.id)
        if (!sfc) {
          console.error(`${logCtx} Sponsor lookup failed:`, sfcError)
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found.',
          })
        }

        if (!sfc.signatureId) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'No signing agreement found for this contract. Send the contract for signing first.',
          })
        }

        const provider = getSigningProvider(sfc.conference.signingProvider)
        let result: { status: string; providerStatus: string }
        try {
          result = await provider.checkStatus(sfc.signatureId)
        } catch (providerError) {
          console.error(
            `${logCtx} Failed to fetch agreement ${sfc.signatureId}:`,
            providerError,
          )
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'Failed to check signing status. The signing service may be temporarily unavailable.',
            cause: providerError,
          })
        }

        const currentStatus = sfc.signatureStatus || 'not-started'
        const newStatus = result.status

        if (newStatus !== currentStatus) {
          const updateFields: Record<string, unknown> = {
            signatureStatus: newStatus,
          }
          if (newStatus === 'signed') {
            updateFields.contractStatus = 'contract-signed'
            updateFields.contractSignedAt = getCurrentDateTime()
          }

          try {
            await clientWrite.patch(input.id).set(updateFields).commit()
          } catch (patchError) {
            console.error(
              `${logCtx} Failed to update signature status:`,
              patchError,
            )
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message:
                'Signing status was retrieved but failed to save the update. Please try again.',
              cause: patchError,
            })
          }

          if (newStatus === 'signed') {
            await publishSponsorStatusChange({
              conferenceId: sfc.conference._id,
              sponsorForConferenceId: input.id,
              previous: sfc,
              next: { contractStatus: 'contract-signed' },
              source: 'crm.checkSignatureStatus',
              triggeredBy: ctx.speaker._id,
            })
          }

          const userId = ctx.speaker._id
          if (userId) {
            try {
              await logSignatureStatusChange(
                input.id,
                currentStatus,
                newStatus,
                userId,
              )
            } catch (logError) {
              console.error(
                `${logCtx} Failed to log signature status change:`,
                logError,
              )
            }
          }

          if (newStatus === 'signed') {
            await sendContractSignedSlackNotification(input.id, sfc)
          }
        }

        return {
          signatureStatus: newStatus,
          agreementStatus: result.providerStatus,
          changed: newStatus !== currentStatus,
        }
      }),

    updateSignatureStatus: adminProcedure
      .input(UpdateSignatureStatusSchema)
      .mutation(async ({ input, ctx }) => {
        const logCtx = `[updateSignatureStatus] sfc=${input.id}`

        const { sponsorForConference: existing, error: existingError } =
          await getSponsorForCurrentConference(input.id)

        if (!existing) {
          console.error(`${logCtx} Sponsor lookup failed:`, existingError)
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found.',
          })
        }

        const oldStatus = existing.signatureStatus || 'not-started'

        // Signature-axis guard: a signature can only be tracked once the
        // contract has been sent. Blocks manually marking pending/signed on a
        // record whose contract never went out.
        assertGuard(
          canTransition('signature', oldStatus, input.newStatus, existing),
        )

        // Marking the signature signed also drives the contract to
        // contract-signed (below), so it must satisfy that state's invariants
        // (tier + value + primary contact, not a dead deal). Routed through
        // canTransition (not checkState) so re-confirming an already-signed
        // record stays a no-op, matching updateContractStatus.
        if (input.newStatus === 'signed') {
          assertGuard(
            canTransition(
              'contract',
              existing.contractStatus,
              'contract-signed',
              existing,
            ),
          )
        }

        try {
          await clientWrite
            .patch(input.id)
            .set({
              signatureStatus: input.newStatus,
              ...(input.newStatus === 'signed' && {
                contractStatus: 'contract-signed',
                contractSignedAt: getCurrentDateTime(),
              }),
            })
            .commit()
        } catch (patchError) {
          console.error(
            `${logCtx} Failed to update signature status:`,
            patchError,
          )
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update the signature status. Please try again.',
            cause: patchError,
          })
        }

        if (input.newStatus === 'signed') {
          await publishSponsorStatusChange({
            conferenceId: existing.conference._id,
            sponsorForConferenceId: input.id,
            previous: existing,
            next: { contractStatus: 'contract-signed' },
            source: 'crm.updateSignatureStatus',
            triggeredBy: ctx.speaker._id,
          })
        }

        const userId = ctx.speaker._id
        if (userId && oldStatus !== input.newStatus) {
          try {
            await logSignatureStatusChange(
              input.id,
              oldStatus,
              input.newStatus,
              userId,
            )
          } catch (logError) {
            console.error(
              `${logCtx} Failed to log signature status change:`,
              logError,
            )
          }
        }

        if (input.newStatus === 'signed') {
          await sendContractSignedSlackNotification(input.id, existing)
        }

        const { sponsorForConference } = await getSponsorForCurrentConference(
          input.id,
        )
        return sponsorForConference
      }),

    sendContract: adminProcedure
      .input(SendContractSchema)
      .mutation(async ({ input, ctx }) => {
        const logCtx = `[sendContract] sfc=${input.sponsorForConferenceId}`

        // OWNERSHIP (#863). The `sponsorForConferenceId` half is scoped by
        // `getSponsorForCurrentConference`, but `templateId` is a SECOND piece
        // of client input and `getContractTemplate` is a global by-id read — so
        // an organizer could render ANOTHER tenant's contract terms into the PDF
        // this conference then signs and mails out. Guarded FIRST, before any
        // lookup, so no foreign document enters the request at all; the sibling
        // `contractTemplates.get/update/delete` guard the same way.
        await requireDocumentInCurrentConference(
          input.templateId,
          'contractTemplate',
        )

        const { sponsorForConference: sfc, error: sfcError } =
          await getSponsorForCurrentConference(input.sponsorForConferenceId)
        if (sfcError || !sfc) {
          console.error(`${logCtx} Sponsor lookup failed:`, sfcError)
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found.',
            cause: sfcError,
          })
        }

        const sponsorName = sfc.sponsor?.name || 'Unknown'
        const logCtxFull = `${logCtx} sponsor="${sponsorName}"`

        if (!sfc.sponsor?.name) {
          console.error(`${logCtxFull} Missing sponsor record/name`)
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'Sponsor information is missing. Please ensure the sponsor is linked before sending a contract.',
          })
        }

        // Contract-sent invariants: tier + positive value, and not a dead deal.
        // Checked path-independently (re-sends included) before any costly work
        // (template fetch, PDF generation, asset upload). The contact / title /
        // template / signing-provider runtime guards below remain in force.
        assertGuard(checkState('contract', 'contract-sent', sfc))

        const { template, error: templateError } = await getContractTemplate(
          input.templateId,
        )
        if (templateError || !template) {
          console.error(
            `${logCtxFull} Template ${input.templateId} not found:`,
            templateError,
          )
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Contract template not found. It may have been deleted.',
            cause: templateError,
          })
        }

        if (!sfc.conference?.title) {
          console.error(`${logCtxFull} Conference missing title`)
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'Conference title is required for contract generation. Update the conference settings.',
          })
        }

        const primaryContact =
          sfc.contactPersons?.find(
            (c: { isPrimary?: boolean }) => c.isPrimary,
          ) || sfc.contactPersons?.[0]
        if (!primaryContact?.name || !primaryContact?.email) {
          console.error(`${logCtxFull} Missing contact person`)
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'A contact person with name and email is required. Complete sponsor registration first.',
          })
        }

        // Generate the PDF
        let pdfBuffer: Buffer
        try {
          pdfBuffer = await generateContractPdf(template, {
            sponsor: {
              name: sfc.sponsor.name,
              orgNumber: sfc.sponsor.orgNumber,
              address: sfc.sponsor.address,
              website: sfc.sponsor.website,
            },
            contactPerson: {
              name: primaryContact.name,
              email: primaryContact.email,
            },
            tier: sfc.tier
              ? { title: sfc.tier.title, tagline: sfc.tier.tagline }
              : undefined,
            addons: sfc.addons?.map((a) => ({ title: a.title })),
            contractValue: sfc.contractValue,
            contractCurrency: sfc.contractCurrency,
            conference: {
              title: sfc.conference.title,
              startDate: sfc.conference.startDate,
              endDate: sfc.conference.endDate,
              city: sfc.conference.city,
              organizer: sfc.conference.organizer,
              organizerOrgNumber: sfc.conference.organizerOrgNumber,
              organizerAddress: sfc.conference.organizerAddress,
              venueName: sfc.conference.venueName,
              venueAddress: sfc.conference.venueAddress,
              sponsorEmail: sfc.conference.sponsorEmail,
              logoBright: sfc.conference.logoBright,
            },
          })
        } catch (pdfError) {
          console.error(`${logCtxFull} PDF generation failed:`, pdfError)
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'Failed to generate contract PDF. Check that the template is valid.',
            cause: pdfError,
          })
        }

        if (!pdfBuffer || pdfBuffer.length === 0) {
          console.error(`${logCtxFull} PDF generation returned empty buffer`)
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'Contract PDF generation produced an empty document. Check the template configuration.',
          })
        }

        // Embed organizer counter-signature if provided
        if (input.organizerSignatureDataUrl) {
          const assignedToId = sfc.assignedTo?._id
          if (!assignedToId || assignedToId !== ctx.speaker._id) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message:
                'Only the assigned organizer can counter-sign this contract.',
            })
          }

          const organizerDisplayName =
            ctx.speaker.name?.trim() || ctx.speaker.email?.trim() || 'Organizer'

          try {
            pdfBuffer = await embedSignatureInPdfBuffer(
              pdfBuffer,
              input.organizerSignatureDataUrl,
              organizerDisplayName,
              {
                signatureMarker: ORGANIZER_SIGNATURE_MARKER,
                dateMarker: ORGANIZER_DATE_MARKER,
              },
            )
          } catch (sigError) {
            console.error(
              `${logCtxFull} Organizer signature embedding failed:`,
              sigError,
            )
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message:
                'Failed to embed organizer signature into the contract PDF.',
              cause: sigError,
            })
          }
        }

        const safeName = sfc.sponsor.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
        const filename = `contract-${safeName}.pdf`

        // Upload PDF to Sanity as a file asset
        let asset: { _id: string }
        try {
          asset = await clientWrite.assets.upload('file', pdfBuffer, {
            filename,
            contentType: 'application/pdf',
          })
        } catch (uploadError) {
          console.error(
            `${logCtxFull} Sanity asset upload failed:`,
            uploadError,
          )
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to upload contract PDF. Please try again.',
            cause: uploadError,
          })
        }

        if (!asset?._id) {
          console.error(`${logCtxFull} Asset upload returned no ID`)
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'Contract PDF upload failed — no asset reference returned.',
          })
        }

        // Update CRM record: contract status, signer email, sent timestamp, document
        const now = getCurrentDateTime()
        const updateFields: Record<string, unknown> = {
          contractStatus: 'contract-sent',
          contractSentAt: now,
          contractTemplate: { _type: 'reference', _ref: input.templateId },
          contractDocument: {
            _type: 'file',
            asset: { _type: 'reference', _ref: asset._id },
          },
        }
        if (input.signerEmail) {
          const signerContact = sfc.contactPersons?.find(
            (c: { email?: string }) => c.email === input.signerEmail,
          )
          updateFields.signerName = signerContact?.name || primaryContact.name
          updateFields.signerEmail = input.signerEmail
          updateFields.signatureStatus = 'pending'
        }

        if (input.organizerSignatureDataUrl) {
          updateFields.organizerSignedAt = now
          updateFields.organizerSignedBy =
            ctx.speaker.name?.trim() || ctx.speaker.email?.trim() || 'Organizer'
        }

        // Send for digital signing if signer email is provided
        let agreementId: string | undefined
        let signingUrl: string | undefined
        if (input.signerEmail) {
          try {
            const provider = getSigningProvider(sfc.conference.signingProvider)
            const signingResult = await provider.sendForSigning({
              pdf: pdfBuffer,
              filename,
              signerEmail: input.signerEmail,
              agreementName: `Sponsorship Agreement - ${sfc.sponsor.name}`,
              message: `Please sign the sponsorship agreement for ${sfc.conference.title}.`,
              // Tenant-derived signing origin; the provider still applies its
              // own env fallback if a conference somehow has no domain.
              baseUrl: hasConferenceDomain(sfc.conference)
                ? conferenceBaseUrl(sfc.conference)
                : undefined,
            })

            agreementId = signingResult.agreementId
            updateFields.signatureId = agreementId

            if (signingResult.signingUrl) {
              signingUrl = signingResult.signingUrl
              updateFields.signingUrl = signingUrl
            }
          } catch (signError) {
            if (signError instanceof TRPCError) throw signError
            console.error(
              `${logCtxFull} Contract signing agreement creation failed:`,
              signError,
            )
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message:
                'Failed to create digital signing agreement. The contract PDF was generated but not sent for signing. Please try again.',
              cause: signError,
            })
          }
        }

        try {
          await clientWrite
            .patch(input.sponsorForConferenceId)
            .set(updateFields)
            .commit()
        } catch (patchError) {
          console.error(
            `${logCtxFull} Failed to update sponsor record:`,
            patchError,
          )
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'Contract was generated but failed to update the sponsor record. Please try again.',
            cause: patchError,
          })
        }

        // Log activity (non-critical)
        const userId = ctx.speaker._id
        if (userId) {
          const oldContractStatus = sfc.contractStatus
          try {
            await logContractStatusChange(
              input.sponsorForConferenceId,
              oldContractStatus,
              'contract-sent',
              userId,
            )
          } catch (logError) {
            console.error(
              `${logCtxFull} Failed to log contract send activity:`,
              logError,
            )
          }

          if (input.signerEmail) {
            const oldSignatureStatus = sfc.signatureStatus ?? 'not-started'
            try {
              await logSignatureStatusChange(
                input.sponsorForConferenceId,
                oldSignatureStatus,
                'pending',
                userId,
              )
            } catch (logError) {
              console.error(
                `${logCtxFull} Failed to log signature status change:`,
                logError,
              )
            }
          }
        }

        // Sending a contract advances the deal to Won (forward-only,
        // tier-guarded). Best-effort: never fail the send over this.
        try {
          const promotion = await promoteToClosedWonOnContract(
            input.sponsorForConferenceId,
            { status: sfc.status, tier: sfc.tier },
            ctx.speaker._id,
          )
          if (promotion.promoted) {
            await publishSponsorStatusChange({
              conferenceId: sfc.conference._id,
              sponsorForConferenceId: input.sponsorForConferenceId,
              previous: sfc,
              next: { status: 'closed-won' },
              source: 'crm.sendContract',
              triggeredBy: ctx.speaker._id,
            })
          }
        } catch (promoteError) {
          console.error(
            `${logCtxFull} Failed to auto-promote pipeline to closed-won:`,
            promoteError,
          )
        }

        // Send branded signing email if we have a signing URL (non-critical)
        if (signingUrl && input.signerEmail && sfc.conference) {
          try {
            const { renderContractEmail, CONTRACT_EMAIL_SLUGS } =
              await import('@/lib/email/contract-email')
            const { resolveEmailSender, retryWithBackoff } =
              await import('@/lib/email/config')

            const { formatNumber } = await import('@/lib/format')
            const contractValueStr = sfc.contractValue
              ? `${formatNumber(sfc.contractValue)} ${sfc.contractCurrency || 'NOK'}`
              : undefined

            const signerContact = sfc.contactPersons?.find(
              (c: { email?: string }) => c.email === input.signerEmail,
            )
            const resolvedSignerName =
              signerContact?.name || primaryContact.name

            const result = await renderContractEmail(
              CONTRACT_EMAIL_SLUGS.SENT,
              {
                sponsorName: sfc.sponsor.name,
                signerName: resolvedSignerName,
                signerEmail: input.signerEmail,
                tierName: sfc.tier?.title,
                contractValue: contractValueStr,
                conference: {
                  title: sfc.conference.title,
                  city: sfc.conference.city,
                  startDate: sfc.conference.startDate,
                  domains: sfc.conference.domains,
                  organizer: sfc.conference.organizer,
                  sponsorEmail: sfc.conference.sponsorEmail,
                  socialLinks: sfc.conference.socialLinks,
                  theme: sfc.conference.theme,
                },
              },
              {
                button: {
                  text: 'Review &amp; Sign Agreement',
                  href: signingUrl,
                },
              },
            )

            if (!result) {
              console.error(`${logCtxFull} Contract email template not found`)
            } else {
              const from = resolveConferenceFrom(sfc.conference, {
                field: 'sponsorEmail',
                localPart: 'sponsors',
              })

              const { client } = await resolveEmailSender(ctx.orgId)

              await retryWithBackoff(async () => {
                return client.emails.send({
                  from,
                  to: [input.signerEmail!],
                  subject: result.subject,
                  react: result.react,
                })
              })
            }
          } catch (emailError) {
            console.error(
              `${logCtxFull} Failed to send signing notification email (non-fatal):`,
              emailError,
            )
          }
        }

        return {
          success: true,
          pdf: pdfBuffer.toString('base64'),
          filename,
          agreementId,
          signingUrl,
        }
      }),

    /**
     * THE one sponsor email primitive (#1261, spec #1260). Recipients are
     * contact keys resolved against the sponsor's own contacts — the client
     * never supplies an address or a conference. Guarded BEFORE the sponsor
     * is read, so a foreign id refuses identically to a missing one and the
     * foreign document never enters the request. Every outcome, including a
     * provider failure, is written to the activity timeline as the audit
     * record; the record itself can never fail or roll back the send.
     */
    sendCommunication: adminProcedure
      .input(SendCommunicationSchema)
      .mutation(async ({ input, ctx }) => {
        // KILL-SWITCHED for the discount kind only (#850, carried over from
        // the removed `sendDiscountEmail`): a ticketing deny switches off
        // ticketing, not sponsor contact. Asked FIRST, so a denied org reads
        // nothing — not even the sponsor's tenancy probe.
        if (input.kind === 'discount') {
          await refuseIfTicketingDenied(ctx.orgId)
        }
        await requireDocumentInCurrentConference(
          input.sponsorForConferenceId,
          'sponsorForConference',
        )

        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain({
            sponsors: true,
            // `SPONSOR_REGISTRATION_URL` is merged on the server to compute
            // `templateEdited`; the composer sees the same link (#1261).
            includeSponsorRegistrationLink: true,
          })
        if (conferenceError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch conference',
          })
        }

        let message: PortableTextBlock[]
        try {
          const parsed = JSON.parse(input.message)
          if (!isValidPortableText(parsed)) {
            throw new Error('Invalid PortableText format')
          }
          message = parsed
        } catch {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid message format. Expected PortableText JSON.',
          })
        }

        // OWNERSHIP of the template reference: the id is client input and is
        // STORED on the audit record as a reference the timeline dereferences.
        // Resolve it through the org-scoped reader (fails closed), so a foreign
        // or wrong-typed id can never become provenance.
        let template: SponsorEmailTemplate | undefined
        if (input.template) {
          const found = await getSponsorEmailTemplate(input.template.id)
          const { error } = found
          template = found.template
          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Could not verify the template',
              cause: error,
            })
          }
          if (!template) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: TEMPLATE_NOT_FOUND_MESSAGE,
            })
          }
          // A contract template carries the signing-link copy; it is not a
          // valid starting point for any other kind, and vice versa.
          const isContractTemplate = template.category === 'contract'
          const isContractKind = (input.kind as string) === 'contract'
          if (isContractTemplate !== isContractKind) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: TEMPLATE_WRONG_KIND_MESSAGE,
            })
          }
        }

        // Discount kind (#1262): the chosen codes must be on THIS
        // conference's provider event and not stored on another sponsor;
        // they ride in a server-built block and are listed on the record.
        const discount =
          input.kind === 'discount'
            ? await prepareDiscountSend(
                conference,
                input.sponsorForConferenceId,
                input.discountCodes ?? [],
              )
            : undefined

        const result = await sendSponsorCommunication({
          conference,
          orgId: ctx.orgId,
          actorId: ctx.speaker._id ?? null,
          sponsorForConferenceId: input.sponsorForConferenceId,
          kind: input.kind,
          recipientKeys: input.recipientKeys,
          subject: input.subject,
          message,
          template,
          senderNames: [ctx.speaker.name, ctx.user?.name],
          ...(discount && {
            appendHtml: discount.html,
            attachments: discount.attachments,
          }),
        })

        if (!result.ok) {
          // Nothing went out, so the codes are nobody's again.
          await discount?.release()
          switch (result.reason) {
            case 'not-found':
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Sponsor not found in this conference',
              })
            case 'bad-recipients':
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: result.message,
              })
            case 'render-failed':
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: result.message,
              })
            case 'send-failed':
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: result.message,
              })
          }
        }

        // Only AFTER the provider accepted the send, and never able to fail
        // it: the email is out, so a failed link write is logged, not thrown.
        let linkedCodes: string[] | undefined
        let linkFailed = false
        if (discount) {
          try {
            const added = await appendLinkedCodes(
              input.sponsorForConferenceId,
              discount.alreadyLinked,
              discount.codes,
              'send',
              discount.adopted,
            )
            linkedCodes = added.map((c) => c.code)
          } catch (error) {
            console.error(
              '[sendCommunication] storing the sponsor discount-code link failed:',
              error,
            )
            linkedCodes = []
            linkFailed = true
          }
        }

        return {
          success: true as const,
          activityId: result.activityId,
          providerMessageId: result.providerMessageId,
          recipientCount: result.recipients.length,
          ...(linkedCodes && { linkedCodes }),
          // The organizer is told, so the gap is fixed by an Assign rather than
          // discovered when the next send falls back to the name guess.
          ...(linkFailed && { linkFailed: true as const }),
        }
      }),

    /**
     * The Send modal's code picker (#1262): every code on the conference's
     * provider event, with the ones attributed to THIS sponsor preselected —
     * its stored codes, or by name only while it stores none — and the ones
     * stored on another sponsor named, since a send would refuse them.
     */
    discountCodeOptions: adminProcedure
      .input(SponsorDiscountCodeOptionsSchema)
      .query(async ({ input, ctx }) => {
        await refuseIfTicketingDenied(ctx.orgId)
        await requireDocumentInCurrentConference(
          input.sponsorForConferenceId,
          'sponsorForConference',
        )
        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain({
            sponsors: true,
            includeSponsorRegistrationLink: true,
          })
        if (conferenceError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch conference',
          })
        }
        const discounts = await readEventDiscountsOrThrow(conference)
        const links = await readLinksOrThrow(conference._id)
        const here = links.find(
          (l) => l.sponsorForConferenceId === input.sponsorForConferenceId,
        )
        const stored = (l: SponsorCodeLink | undefined, code: string) =>
          !!l?.linkedCodes.some(
            (c) => normalizeDiscountCode(c) === normalizeDiscountCode(code),
          )
        // The usage view's claimant set (conference sponsors + stored codes),
        // so the picker preselects exactly what that view counts as theirs.
        const claimants = withLinkedCodes(conference.sponsors, links)
        const codes = discounts.flatMap((d) => {
          const code = d.triggerValue
          if (!code) return []
          const owner = sponsorOwningCode(code, claimants)
          const elsewhere = links.find((l) => l !== here && stored(l, code))
          return [
            {
              code,
              // A CRM record that is not (yet) a conference sponsor claims
              // only what it stores.
              selected:
                stored(here, code) || (!!here && owner?.id === here.sponsorId),
              linked: stored(here, code),
              ...(elsewhere && {
                linkedTo: elsewhere.name || 'another sponsor',
              }),
              // Counted for another sponsor by name: sending it moves it here.
              ...(!elsewhere &&
                owner &&
                owner.id !== here?.sponsorId && { attributedTo: owner.name }),
            },
          ]
        })
        return {
          codes,
          ticketUrl: sponsorTicketUrl(conference),
          // Sponsor ticket types are hidden on the public store: without the
          // invite link the email points at a page with nothing to claim.
          hasSponsorInviteLink: !!conference.sponsorRegistrationLink,
        }
      }),

    /**
     * Discount code manager → Assign to sponsor (#1262): link codes created
     * in advance WITHOUT sending them. Same checks as a discount send (on the
     * conference's own event, not stored on another sponsor), same kill
     * switch, and the assignment is logged on the sponsor's timeline. Unlike
     * the send, a failed write is the whole action, so it is reported.
     */
    assignDiscountCodes: adminProcedure
      .input(AssignDiscountCodesSchema)
      .mutation(async ({ input, ctx }) => {
        await refuseIfTicketingDenied(ctx.orgId)
        await requireDocumentInCurrentConference(
          input.sponsorForConferenceId,
          'sponsorForConference',
        )
        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain({ sponsors: true })
        if (conferenceError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch conference',
          })
        }
        const { codes, alreadyLinked, adopted, release } =
          await resolveSponsorDiscountCodes(
            conference,
            input.sponsorForConferenceId,
            input.discountCodes,
          )
        let added: Awaited<ReturnType<typeof linkCodesToSponsor>>
        try {
          added = await linkCodesToSponsor({
            sponsorForConferenceId: input.sponsorForConferenceId,
            alreadyLinked,
            codes,
            via: 'assign',
            actorId: ctx.speaker._id,
            adopted,
          })
        } catch (error) {
          // Nothing was linked: the claims go back so a retry can win them.
          await release()
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Could not assign the discount code',
            cause: error,
          })
        }
        return { success: true as const, linkedCodes: added.map((c) => c.code) }
      }),

    /**
     * DEPRECATED shim for the external `cnctl` CLI (`cnctl admin sponsors
     * email` posts here with a Markdown body — see
     * CloudNativeBergen/cnctl `src/commands/sponsors/email.rs`). It is the
     * old wire shape on top of the ONE send primitive: every contact with an
     * email is a recipient, the kind is `information`, and the send is
     * recorded exactly like a modal send. Remove once cnctl calls
     * `sendCommunication` itself.
     */
    sendEmailBySfc: adminProcedure
      .input(
        z.object({
          sponsorForConferenceId: z.string().min(1),
          // The OLD wire contract, unchanged for cnctl: any non-empty subject.
          subject: z.string().min(1),
          body: z.string().min(1).max(50000),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        await requireDocumentInCurrentConference(
          input.sponsorForConferenceId,
          'sponsorForConference',
        )
        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain({ sponsors: true })
        if (conferenceError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch conference',
          })
        }
        const { markdownToPortableTextBody } =
          await import('@/lib/email/markdown')
        const message = markdownToPortableTextBody(input.body)
        if (message.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Message body is empty after conversion',
          })
        }
        // The old contract: every contact that has an email. Resolved on the
        // server from the sponsor's own contacts, like any other send.
        const contacts = await clientReadUncached.fetch<
          Array<{ _key: string; email?: string }>
        >(
          `*[_type == "sponsorForConference" && _id == $sfcId && conference._ref == $conferenceId][0].contactPersons[]{ _key, email }`,
          {
            sfcId: input.sponsorForConferenceId,
            conferenceId: conference._id,
          },
        )
        const recipientKeys = (contacts ?? [])
          .filter((c) => !!c.email)
          .map((c) => c._key)
        if (recipientKeys.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Sponsor has no contact persons with email addresses',
          })
        }
        const result = await sendSponsorCommunication({
          conference,
          orgId: ctx.orgId,
          actorId: ctx.speaker._id ?? null,
          sponsorForConferenceId: input.sponsorForConferenceId,
          kind: 'information',
          recipientKeys,
          subject: input.subject,
          message,
          senderNames: [ctx.speaker.name, ctx.user?.name],
        })
        if (!result.ok) {
          throw new TRPCError({
            code:
              result.reason === 'not-found'
                ? 'NOT_FOUND'
                : result.reason === 'bad-recipients'
                  ? 'BAD_REQUEST'
                  : 'INTERNAL_SERVER_ERROR',
            message:
              result.reason === 'not-found'
                ? 'Sponsor not found in this conference'
                : result.message,
          })
        }
        return {
          success: true as const,
          emailId: result.providerMessageId,
          recipientCount: result.recipients.length,
        }
      }),

    broadcastEmail: adminProcedure
      .input(
        z.object({
          subject: z.string().min(1),
          message: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain()

        if (conferenceError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch conference',
          })
        }

        let messagePortableText: PortableTextBlock[]
        try {
          const parsed = JSON.parse(input.message)
          if (!isValidPortableText(parsed)) {
            throw new Error('Invalid PortableText format')
          }
          messagePortableText = parsed
        } catch {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid message format. Expected PortableText JSON.',
          })
        }

        const response = await sendBroadcastEmail({
          conference,
          subject: input.subject,
          messagePortableText,
          audienceType: 'sponsors',
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: errorData.error || 'Failed to send broadcast email',
          })
        }

        try {
          const userId = ctx.speaker._id
          const sponsors = await clientReadUncached.fetch<
            Array<{ _id: string; status: string }>
          >(
            `*[_type == "sponsorForConference" && conference._ref == $conferenceId]{_id, status}`,
            { conferenceId: conference._id },
          )

          if (sponsors.length > 0 && userId) {
            const sponsorIds = sponsors.map((s) => s._id)
            await logBulkEmailSent(sponsorIds, input.subject, userId)

            const prospectIds = sponsors
              .filter((s) => s.status === 'prospect')
              .map((s) => s._id)

            if (prospectIds.length > 0) {
              const transaction = clientWrite.transaction()
              for (const id of prospectIds) {
                transaction.patch(id, { set: { status: 'contacted' } })
              }
              await transaction.commit()
            }
          }
        } catch (crmError) {
          console.warn('[broadcastEmail] CRM tracking failed:', crmError)
        }

        return await response.json()
      }),

    syncAudience: adminProcedure.mutation(async () => {
      const { conference, error: conferenceError } =
        await getConferenceForCurrentDomain()

      if (conferenceError || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch conference',
        })
      }

      const { sponsors: crmSponsors, error: crmError } =
        await listSponsorsForConference(conference._id)

      if (crmError || !crmSponsors) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to load sponsor CRM data',
        })
      }

      const eligibleSponsors = crmSponsors.filter(
        (s: SponsorForConferenceExpanded) =>
          s.contactPersons &&
          s.contactPersons.length > 0 &&
          s.contactPersons.some((contact) => contact.email),
      )

      if (eligibleSponsors.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'No sponsors with contact information found. Add contact information to sponsors before syncing.',
        })
      }

      const sponsorContacts: Contact[] = eligibleSponsors.flatMap(
        (s: SponsorForConferenceExpanded) =>
          s.contactPersons
            ?.filter((contact) => contact.email)
            .map((contact) => ({
              email: contact.email,
              firstName: contact.name?.split(' ')[0] || '',
              lastName: contact.name?.split(' ').slice(1).join(' ') || '',
              organization: s.sponsor.name,
            })) || [],
      )

      const {
        success,
        audienceId,
        syncedCount,
        addedCount,
        removedCount,
        error: syncError,
      } = await syncSponsorAudience(conference, sponsorContacts)

      if (!success || syncError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: syncError?.message || 'Failed to sync sponsor audience',
        })
      }

      return {
        success: true,
        audienceId,
        syncedCount,
        addedCount,
        removedCount,
        message: `Successfully synced ${syncedCount} sponsor contacts (${addedCount} added, ${removedCount} removed)`,
      }
    }),
  }),

  emailTemplates: router({
    list: adminProcedure.query(async () => {
      const { templates, error } = await getSponsorEmailTemplates()
      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list email templates',
          cause: error,
        })
      }
      return templates || []
    }),

    listForSponsor: adminProcedure
      .input(
        z.object({
          sponsorForConferenceId: z.string().min(1),
        }),
      )
      .query(async ({ input, ctx }) => {
        const { templates, error: templatesError } =
          await getSponsorEmailTemplates()
        if (templatesError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to list email templates',
            cause: templatesError,
          })
        }

        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain({
            sponsors: true,
            // Server-side only (adminProcedure): the link is merged into the
            // Markdown templates served to the CLI, never into a page payload.
            includeSponsorRegistrationLink: true,
          })
        if (conferenceError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch conference',
          })
        }

        // Narrow type matching the actual GROQ projection
        type SfcEmailContext = {
          _id: string
          status: string
          tags?: string[]
          contactPersons?: Array<{
            name: string
            email?: string
            isPrimary?: boolean
          }>
          sponsor?: {
            _id: string
            name: string
            website?: string
            orgNumber?: string
          }
          tier?: { _id: string; title: string }
          contractCurrency?: string
        }

        // Scope lookup to the current conference to prevent cross-conference access
        const sfc = await clientReadUncached.fetch<SfcEmailContext>(
          `*[_type == "sponsorForConference" && _id == $sfcId && conference._ref == $conferenceId][0]{
            _id,
            status,
            tags,
            contactPersons[]{ name, email, isPrimary },
            sponsor->{ _id, name, website, orgNumber },
            tier->{ _id, title },
            contractCurrency
          }`,
          {
            sfcId: input.sponsorForConferenceId,
            conferenceId: conference._id,
          },
        )

        if (!sfc) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor not found in this conference',
          })
        }

        // Build recipients from contacts with email addresses
        const recipients = (sfc.contactPersons || [])
          .filter((c): c is typeof c & { email: string } => !!c.email)
          .map((c) => ({ name: c.name, email: c.email }))

        // Derive CONTACT_NAMES from recipients only (not all contacts)
        const contactNames = recipients.map((r) => r.name).join(' and ')
        const sponsorName = sfc.sponsor?.name || 'Unknown'
        const tierName = sfc.tier?.title

        const variables = buildTemplateVariables({
          sponsorName,
          contactNames: contactNames || undefined,
          conference: {
            title: conference.title,
            startDate: conference.startDate,
            city: conference.city,
            organizer: conference.organizer,
            domains: conference.domains,
            prospectusUrl: conference.sponsorshipCustomization?.prospectusUrl,
            sponsorRegistrationLink: conference.sponsorRegistrationLink,
          },
          senderName: ctx.speaker.name || undefined,
          tierName,
        })

        // Sort templates by relevance for this sponsor
        const suggestedCategory = suggestTemplateCategory({
          tags: sfc.tags,
          status: sfc.status,
        })
        const suggestedLanguage = suggestTemplateLanguage({
          currency: sfc.contractCurrency,
          orgNumber: sfc.sponsor?.orgNumber,
          website: sfc.sponsor?.website,
        })

        const allTemplates = templates || []

        // Score each template and sort by relevance (highest first)
        const scored = allTemplates.map((t) => {
          let score = 0
          if (t.category === suggestedCategory) score += 4
          if (t.language === suggestedLanguage) score += 2
          if (t.isDefault) score += 1
          return { template: t, score }
        })
        scored.sort((a, b) => b.score - a.score)

        // Convert PT bodies to markdown
        const { portableTextBodyToMarkdown } =
          await import('@/lib/email/markdown')

        const templatesWithMarkdown = scored.map(({ template: t }) => ({
          _id: t._id,
          title: t.title,
          slug: t.slug,
          category: t.category,
          language: t.language,
          subject: t.subject,
          bodyMarkdown: t.body
            ? portableTextBodyToMarkdown(t.body as PortableTextBlock[])
            : '',
          description: t.description,
          isDefault: t.isDefault,
          sortOrder: t.sortOrder,
        }))

        return {
          templates: templatesWithMarkdown,
          variables,
          recipients,
          sponsorName,
          suggestedCategory,
          suggestedLanguage,
        }
      }),

    get: adminProcedure.input(IdParamSchema).query(async ({ input }) => {
      const { template, error } = await getSponsorEmailTemplate(input.id)
      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch email template',
          cause: error,
        })
      }
      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Email template not found',
        })
      }
      return template
    }),

    create: adminProcedure
      .input(SponsorEmailTemplateInputSchema)
      .mutation(async ({ input }) => {
        const { template, error } = await createSponsorEmailTemplate(input)
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create email template',
            cause: error,
          })
        }
        return template
      }),

    update: adminProcedure
      .input(IdParamSchema.merge(SponsorEmailTemplateUpdateSchema))
      .mutation(async ({ input }) => {
        const { id, ...data } = input
        const { template, error } = await updateSponsorEmailTemplate(id, data)
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update email template',
            cause: error,
          })
        }
        return template
      }),

    delete: adminProcedure.input(IdParamSchema).mutation(async ({ input }) => {
      const { error } = await deleteSponsorEmailTemplate(input.id)
      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete email template',
          cause: error,
        })
      }
      return { success: true }
    }),

    setDefault: adminProcedure
      .input(SetDefaultTemplateSchema)
      .mutation(async ({ input }) => {
        const { error } = await setDefaultSponsorEmailTemplate(input.id)
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to set default template',
            cause: error,
          })
        }
        return { success: true }
      }),

    reorder: adminProcedure
      .input(ReorderTemplatesSchema)
      .mutation(async ({ input }) => {
        const { error } = await reorderSponsorEmailTemplates(input.orderedIds)
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to reorder templates',
            cause: error,
          })
        }
        return { success: true }
      }),
  }),

  contractTemplates: router({
    list: adminProcedure.input(ContractTemplateListSchema).query(async () => {
      const conferenceId = await resolveConferenceId()
      const { templates, error } = await listContractTemplates(conferenceId)
      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list contract templates',
          cause: error,
        })
      }
      return templates || []
    }),

    get: adminProcedure
      .input(ContractTemplateIdSchema)
      .query(async ({ input }) => {
        // OWNERSHIP (#730): `getContractTemplate` is a by-id read with no tenant
        // predicate — the sibling update/delete are guarded, this was not.
        await requireDocumentInCurrentConference(input.id, 'contractTemplate')
        const { template, error } = await getContractTemplate(input.id)
        if (error) {
          throw new TRPCError({
            code: error.message.includes('not found')
              ? 'NOT_FOUND'
              : 'INTERNAL_SERVER_ERROR',
            message: error.message,
            cause: error,
          })
        }
        return template
      }),

    create: adminProcedure
      .input(ContractTemplateInputSchema)
      .mutation(async ({ input }) => {
        // OWNERSHIP (#730): `data.conference` is client input — without this a
        // tenant could PLANT a contract template inside another's conference.
        const conferenceId = await resolveConferenceId()
        if (input.conference !== conferenceId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot create a contract template in another conference',
          })
        }
        const { template, error } = await createContractTemplate(input)
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create contract template',
            cause: error,
          })
        }
        return template
      }),

    update: adminProcedure
      .input(ContractTemplateUpdateSchema)
      .mutation(async ({ input }) => {
        const { id, ...data } = input
        // OWNERSHIP (#730): `updateContractTemplate` is a bare patch. Contrast
        // the sponsor EMAIL templates, guarded by `isTemplateInCurrentOrg`.
        await requireDocumentInCurrentConference(id, 'contractTemplate')
        const { template, error } = await updateContractTemplate(id, {
          ...data,
          tier: data.tier === null ? undefined : data.tier,
          currency: data.currency === null ? undefined : data.currency,
          headerText: data.headerText === null ? undefined : data.headerText,
          footerText: data.footerText === null ? undefined : data.footerText,
          terms: data.terms === null ? [] : data.terms,
        })
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update contract template',
            cause: error,
          })
        }
        return template
      }),

    delete: adminProcedure
      .input(ContractTemplateIdSchema)
      .mutation(async ({ input }) => {
        // OWNERSHIP (#730): `deleteContractTemplate` is a bare delete.
        await requireDocumentInCurrentConference(input.id, 'contractTemplate')
        const { error } = await deleteContractTemplate(input.id)
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete contract template',
            cause: error,
          })
        }
        return { success: true }
      }),

    findBest: adminProcedure
      .input(FindBestContractTemplateSchema)
      .query(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const { template, error } = await findBestContractTemplate(
          conferenceId,
          input.tierId,
          input.language,
        )
        if (error) {
          return null
        }
        return template ?? null
      }),

    contractReadiness: adminProcedure
      .input(SponsorForConferenceIdSchema)
      .query(async ({ input }) => {
        const { sponsorForConference, error } =
          await getSponsorForCurrentConference(input.id)
        if (error || !sponsorForConference) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
            cause: error,
          })
        }
        return checkContractReadiness(sponsorForConference)
      }),

    generatePdf: adminProcedure
      .input(GenerateContractPdfSchema)
      .mutation(async ({ input }) => {
        // OWNERSHIP (#863). Same defect as `crm.sendContract`, and worse in one
        // respect: the rendered template comes straight back to the caller as a
        // base64 PDF, so a foreign template's full terms were readable without
        // sending anything. Guard first — the document must not be fetched at
        // all for an id we do not own.
        await requireDocumentInCurrentConference(
          input.templateId,
          'contractTemplate',
        )

        const { template, error: templateError } = await getContractTemplate(
          input.templateId,
        )
        if (templateError || !template) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Contract template not found',
            cause: templateError,
          })
        }

        const { sponsorForConference, error: sfcError } =
          await getSponsorForCurrentConference(input.sponsorForConferenceId)
        if (sfcError || !sponsorForConference) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
            cause: sfcError,
          })
        }

        const primaryContact =
          sponsorForConference.contactPersons?.find((c) => c.isPrimary) ||
          sponsorForConference.contactPersons?.[0]

        try {
          const pdfBuffer = await generateContractPdf(template, {
            sponsor: {
              name: sponsorForConference.sponsor.name,
              orgNumber: sponsorForConference.sponsor.orgNumber,
              address: sponsorForConference.sponsor.address,
              website: sponsorForConference.sponsor.website,
            },
            contactPerson: primaryContact
              ? { name: primaryContact.name, email: primaryContact.email }
              : undefined,
            tier: sponsorForConference.tier
              ? {
                  title: sponsorForConference.tier.title,
                  tagline: sponsorForConference.tier.tagline,
                }
              : undefined,
            addons: sponsorForConference.addons?.map((a) => ({
              title: a.title,
            })),
            contractValue: sponsorForConference.contractValue,
            contractCurrency: sponsorForConference.contractCurrency,
            conference: {
              title: sponsorForConference.conference.title,
              startDate: sponsorForConference.conference.startDate,
              endDate: sponsorForConference.conference.endDate,
              city: sponsorForConference.conference.city,
              organizer: sponsorForConference.conference.organizer,
              organizerOrgNumber:
                sponsorForConference.conference.organizerOrgNumber,
              organizerAddress:
                sponsorForConference.conference.organizerAddress,
              venueName: sponsorForConference.conference.venueName,
              venueAddress: sponsorForConference.conference.venueAddress,
              sponsorEmail: sponsorForConference.conference.sponsorEmail,
              logoBright: sponsorForConference.conference.logoBright,
            },
          })

          const base64 = pdfBuffer.toString('base64')
          return {
            pdf: base64,
            filename: `contract-${sponsorForConference.sponsor.name.toLowerCase().replace(/\s+/g, '-')}.pdf`,
          }
        } catch (pdfError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to generate contract PDF',
            cause: pdfError,
          })
        }
      }),

    previewPdf: adminProcedure
      .input(PreviewContractPdfSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const conference = await clientReadUncached.fetch<Conference | null>(
          `*[_type == "conference" && _id == $id][0]`,
          { id: conferenceId },
        )
        if (!conference) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Conference not found',
          })
        }

        let tierTitle: string | undefined
        if (input.tierId) {
          const { sponsorTier } = await getSponsorTier(input.tierId)
          tierTitle = sponsorTier?.title
        }

        const previewNow = getCurrentDateTime()
        const template = {
          _id: 'preview',
          _createdAt: previewNow,
          _updatedAt: previewNow,
          title: input.title || 'Sponsor Agreement',
          conference: {
            _id: conference._id,
            title: conference.title,
          },
          language: input.language,
          currency: input.currency,
          sections: input.sections.map((s, i) => ({
            _key: s._key || `preview-${i}`,
            heading: s.heading,
            body: s.body,
          })),
          headerText: input.headerText,
          footerText: input.footerText,
          terms: input.terms,
          isDefault: false,
          isActive: true,
        }

        try {
          const pdfBuffer = await generateContractPdf(template, {
            sponsor: {
              name: 'Acme Corporation AS',
              orgNumber: '987 654 321',
              address: 'Storgata 1, 0182 Oslo',
              website: 'https://acme.example.com',
            },
            contactPerson: {
              name: 'Jane Doe',
              email: 'jane.doe@acme.example.com',
            },
            tier: tierTitle ? { title: tierTitle } : { title: 'Gold Partner' },
            addons: [
              { title: 'Speakers Dinner' },
              { title: 'Barista Bar Sponsorship' },
            ],
            contractValue: 50000,
            contractCurrency: input.currency || 'NOK',
            conference: {
              title: conference.title,
              startDate: conference.startDate,
              endDate: conference.endDate,
              city: conference.city,
              organizer: conference.organizer,
              organizerOrgNumber:
                conference.organizerOrgNumber || '000 000 000',
              organizerAddress:
                conference.organizerAddress || 'Address not set',
              venueName: conference.venueName,
              venueAddress: conference.venueAddress,
              sponsorEmail: conference.sponsorEmail,
              logoBright: conference.logoBright,
            },
          })

          return { pdf: pdfBuffer.toString('base64') }
        } catch (pdfError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to generate preview PDF',
            cause: pdfError,
          })
        }
      }),

    updateConferenceOrgInfo: adminProcedure
      .input(
        z.object({
          organizerOrgNumber: z.string().optional(),
          organizerAddress: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()

        const fields: Record<string, string> = {}
        if (input.organizerOrgNumber !== undefined) {
          fields.organizerOrgNumber = input.organizerOrgNumber
        }
        if (input.organizerAddress !== undefined) {
          fields.organizerAddress = input.organizerAddress
        }
        if (Object.keys(fields).length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No fields to update',
          })
        }
        await clientWrite.patch(conferenceId).set(fields).commit()
        // `organizerOrgNumber`/`organizerAddress` are CONFERENCE-document
        // fields, and they are read back out of the cached conference to fill
        // in generated sponsor contracts. Without this, an organizer who
        // corrects their org number keeps signing contracts with the old one.
        revalidateTag(conferenceTag(conferenceId), 'default')
        return { success: true }
      }),
  }),
})
