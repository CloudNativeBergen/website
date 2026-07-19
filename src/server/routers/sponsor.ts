import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { revalidateTag } from 'next/cache'
import { router, adminProcedure, resolveConferenceId } from '../trpc'
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
  WebhookUrlSchema,
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
  buildTemplateVariables,
  suggestTemplateCategory,
  suggestTemplateLanguage,
} from '@/lib/sponsor/templates'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import type { Conference } from '@/lib/conference/types'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import type { SponsorTierExisting } from '@/lib/sponsor/types'
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
  deleteSponsorActivity,
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
  SponsorCRMFilterSchema,
} from '@/server/schemas/sponsorForConference'
import {
  listActivitiesForSponsor,
  listActivitiesForConference,
} from '@/lib/sponsor-crm/activities'
import { bulkUpdateSponsors, bulkDeleteSponsors } from '@/lib/sponsor-crm/bulk'
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
import { resend, retryWithBackoff } from '@/lib/email/config'
import { sendBroadcastEmail } from '@/lib/email/broadcast'
import { sendIndividualEmail } from '@/lib/email/broadcast'
import { syncSponsorAudience, type Contact } from '@/lib/email/audience'
import { logEmailSent, logBulkEmailSent } from '@/lib/sponsor-crm/activity'
import {
  convertPortableTextToHTML,
  renderEmailTemplate,
} from '@/lib/email/route-helpers'
import { isValidPortableText } from '@/lib/portabletext/validation'
import type { PortableTextBlock } from '@portabletext/types'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

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

async function getAllSponsorTiers(conferenceId?: string): Promise<{
  sponsorTiers?: SponsorTierExisting[]
  error?: Error
}> {
  try {
    const query = conferenceId
      ? `*[_type == "sponsorTier" && conference._ref == $conferenceId]`
      : `*[_type == "sponsorTier"]`

    const params = conferenceId ? { conferenceId } : {}

    const sponsorTiers = await clientWrite.fetch(
      `${query}{
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
        maxQuantity
      }`,
      params,
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
    conference?: { _id?: string; domains?: string[] }
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

export const sponsorRouter = router({
  list: adminProcedure
    .input(z.object({ query: z.string().optional() }).optional())
    .query(async ({ input }) => {
      try {
        let result
        if (input?.query) {
          result = await searchSponsors(input.query)
        } else {
          result = await getAllSponsors()
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
        const validationErrors = validateSponsor(input)
        if (validationErrors.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Sponsor contains invalid fields',
            cause: { validationErrors },
          })
        }

        const { sponsor, error } = await createSponsor(input)
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create sponsor',
            cause: error,
          })
        }

        return sponsor
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
        if (Object.keys(input.data).length > 0) {
          const { sponsor: existingSponsor } = await getSponsor(input.id)
          if (!existingSponsor) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Sponsor not found',
            })
          }

          const mergedData = {
            ...existingSponsor,
            ...input.data,
          }
          const validationErrors = validateSponsor(mergedData)
          if (validationErrors.length > 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Sponsor contains invalid fields',
              cause: { validationErrors },
            })
          }

          const { sponsor, error } = await updateSponsor(input.id, mergedData)

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

          return sponsor
        } else {
          const { sponsor } = await getSponsor(input.id)
          if (!sponsor) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Sponsor not found',
            })
          }
          return sponsor
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

  delete: adminProcedure.input(IdParamSchema).mutation(async ({ input }) => {
    const { error } = await deleteSponsor(input.id)

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
      const { sponsorTiers, error } = await getAllSponsorTiers()

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

        revalidateTag('content:sponsor', 'default')
        revalidateTag('content:conferences', 'default')

        return sponsorTier
      }),

    update: adminProcedure
      .input(IdParamSchema.extend({ data: SponsorTierUpdateSchema }))
      .mutation(async ({ input }) => {
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

          revalidateTag('content:sponsor', 'default')
          revalidateTag('content:conferences', 'default')

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
      const { error } = await deleteSponsorTier(input.id)

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete sponsor tier',
          cause: error,
        })
      }

      revalidateTag('content:sponsor', 'default')
      revalidateTag('content:conferences', 'default')

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

        return sponsorForConference
      }),

    update: adminProcedure
      .input(SponsorForConferenceUpdateSchema)
      .mutation(async ({ input, ctx }) => {
        const { id, ...updateData } = input

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

          return await bulkUpdateSponsors(input, userId)
        } catch (error) {
          if (error instanceof TRPCError) throw error

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
          return await bulkDeleteSponsors(input.ids, {
            deleteContractAssets: input.deleteContractAssets,
          })
        } catch (error) {
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
      .mutation(async ({ input }) => {
        const { result, error } = await copySponsorsFromPreviousYear(input)

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
      .mutation(async ({ input }) => {
        const { result, error } = await importAllHistoricSponsors(input)

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
            const conferenceDomain = sfc.conference.domains?.[0]
            const signingResult = await provider.sendForSigning({
              pdf: pdfBuffer,
              filename,
              signerEmail: input.signerEmail,
              agreementName: `Sponsorship Agreement - ${sfc.sponsor.name}`,
              message: `Please sign the sponsorship agreement for ${sfc.conference.title}.`,
              baseUrl: conferenceDomain
                ? `https://${conferenceDomain}`
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

        // Send branded signing email if we have a signing URL (non-critical)
        if (signingUrl && input.signerEmail && sfc.conference) {
          try {
            const { renderContractEmail, CONTRACT_EMAIL_SLUGS } =
              await import('@/lib/email/contract-email')
            const { resend, retryWithBackoff } =
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
              const fromEmail =
                sfc.conference.sponsorEmail || 'sponsors@cloudnativeday.no'
              const fromName = sfc.conference.organizer || 'Cloud Native Days'

              await retryWithBackoff(async () => {
                return resend.emails.send({
                  from: `${fromName} <${fromEmail}>`,
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

    sendEmail: adminProcedure
      .input(
        z.object({
          sponsorId: z.string().min(1),
          subject: z.string().min(1),
          message: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain({ sponsors: true })

        if (conferenceError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch conference',
          })
        }

        const sfc = await clientReadUncached.fetch<{
          _id: string
          status: string
          contactInitiatedAt?: string
          outreachCount?: number
          contactPersons?: Array<{ name: string; email: string }>
        }>(
          `*[_type == "sponsorForConference" && sponsor._ref == $sponsorId && conference._ref == $conferenceId][0]{
            _id,
            status,
            contactInitiatedAt,
            outreachCount,
            contactPersons[]{ name, email }
          }`,
          { sponsorId: input.sponsorId, conferenceId: conference._id },
        )

        if (!sfc) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor not found in this conference',
          })
        }

        const contacts = sfc.contactPersons || []
        const recipients = contacts
          .filter((c) => c.email)
          .map((c) => ({ email: c.email, name: c.name }))

        if (recipients.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Sponsor has no contact persons with email addresses',
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

        const { htmlContent, error: htmlError } =
          await convertPortableTextToHTML(messagePortableText)
        if (htmlError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to convert message to HTML',
          })
        }

        const emailTemplate = renderEmailTemplate({
          conference,
          subject: input.subject,
          htmlContent: htmlContent!,
          unsubscribeUrl: undefined,
        })

        if (!conference.sponsorEmail) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Missing sponsorEmail in conference configuration',
          })
        }

        const result = await retryWithBackoff(async () => {
          return await resend.emails.send({
            from: `${conference.organizer || 'Cloud Native Days'} <${conference.sponsorEmail}>`,
            to: recipients.map((r) => r.email),
            subject: input.subject,
            react: emailTemplate,
          })
        })

        if (result.error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: result.error.message,
          })
        }

        try {
          const userId = ctx.speaker._id
          if (sfc && userId) {
            try {
              await logEmailSent(sfc._id, input.subject, userId)
            } catch (logError) {
              console.error(
                '[sendEmail] Failed to log email activity:',
                logError,
              )
            }

            // Track outreach metrics
            try {
              const patch = clientWrite.patch(sfc._id)
              if (!sfc.contactInitiatedAt) {
                patch.set({ contactInitiatedAt: getCurrentDateTime() })
              }
              patch.set({ outreachCount: (sfc.outreachCount || 0) + 1 })

              if (sfc.status === 'prospect') {
                patch.set({ status: 'contacted' })
              }
              await patch.commit()

              if (sfc.status === 'prospect') {
                await logStageChange(sfc._id, 'prospect', 'contacted', userId)
              }
            } catch (statusError) {
              console.error(
                '[sendEmail] Failed to update sponsor tracking:',
                statusError,
              )
            }
          }
        } catch (crmError) {
          console.warn('[sendEmail] CRM tracking failed:', crmError)
        }

        return {
          success: true,
          emailId: result.data?.id,
          recipientCount: recipients.length,
        }
      }),

    sendEmailBySfc: adminProcedure
      .input(
        z.object({
          sponsorForConferenceId: z.string().min(1),
          subject: z.string().min(1),
          body: z.string().min(1).max(50000),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain({ sponsors: true })

        if (conferenceError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch conference',
          })
        }

        // Scope lookup to the current conference to prevent cross-conference access
        const sfc = await clientReadUncached.fetch<{
          _id: string
          status: string
          contactInitiatedAt?: string
          outreachCount?: number
          contactPersons?: Array<{ name: string; email: string }>
        }>(
          `*[_type == "sponsorForConference" && _id == $sfcId && conference._ref == $conferenceId][0]{
            _id,
            status,
            contactInitiatedAt,
            outreachCount,
            contactPersons[]{ name, email }
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

        const recipients = (sfc.contactPersons || [])
          .filter((c) => c.email)
          .map((c) => ({ email: c.email, name: c.name }))

        if (recipients.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Sponsor has no contact persons with email addresses',
          })
        }

        const { markdownToPortableTextBody } =
          await import('@/lib/email/markdown')
        const messagePortableText = markdownToPortableTextBody(input.body)
        if (messagePortableText.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Message body is empty after conversion',
          })
        }

        const { htmlContent, error: htmlError } =
          await convertPortableTextToHTML(messagePortableText)
        if (htmlError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to convert message to HTML',
          })
        }

        const emailTemplate = renderEmailTemplate({
          conference,
          subject: input.subject,
          htmlContent: htmlContent!,
          unsubscribeUrl: undefined,
        })

        if (!conference.sponsorEmail) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Missing sponsorEmail in conference configuration',
          })
        }

        const result = await retryWithBackoff(async () => {
          return await resend.emails.send({
            from: `${conference.organizer || 'Cloud Native Days'} <${conference.sponsorEmail}>`,
            to: recipients.map((r) => r.email),
            subject: input.subject,
            react: emailTemplate,
          })
        })

        if (result.error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: result.error.message,
          })
        }

        try {
          const userId = ctx.speaker._id
          if (userId) {
            try {
              await logEmailSent(sfc._id, input.subject, userId)
            } catch (logError) {
              console.error(
                '[sendEmailBySfc] Failed to log email activity:',
                logError,
              )
            }

            try {
              const patch = clientWrite.patch(sfc._id)
              if (!sfc.contactInitiatedAt) {
                patch.set({ contactInitiatedAt: getCurrentDateTime() })
              }
              patch.set({ outreachCount: (sfc.outreachCount || 0) + 1 })

              if (sfc.status === 'prospect') {
                patch.set({ status: 'contacted' })
              }
              await patch.commit()

              if (sfc.status === 'prospect') {
                await logStageChange(sfc._id, 'prospect', 'contacted', userId)
              }
            } catch (statusError) {
              console.error(
                '[sendEmailBySfc] Failed to update sponsor tracking:',
                statusError,
              )
            }
          }
        } catch (crmError) {
          console.warn('[sendEmailBySfc] CRM tracking failed:', crmError)
        }

        return {
          success: true,
          emailId: result.data?.id,
          recipientCount: recipients.length,
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

    sendDiscountEmail: adminProcedure
      .input(
        z.object({
          sponsorId: z.string().min(1),
          discountCode: z.string().min(1),
          subject: z.string().min(1),
          message: z.string().min(1),
          ticketUrl: z.string().url(),
        }),
      )
      .mutation(async ({ input }) => {
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

        const sfc = await clientReadUncached.fetch<{
          _id: string
          sponsor: { name: string }
          contactPersons?: Array<{
            _key: string
            name: string
            email: string
            phone?: string
            role?: string
          }>
        }>(
          `*[_type == "sponsorForConference" && sponsor._ref == $sponsorId && conference._ref == $conferenceId][0]{
            _id,
            sponsor->{ name },
            contactPersons[]{ _key, name, email, phone, role }
          }`,
          { sponsorId: input.sponsorId, conferenceId: conference._id },
        )

        if (!sfc) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor not found in this conference',
          })
        }

        const ccEmails: string[] = []
        if (sfc.contactPersons) {
          sfc.contactPersons.forEach((contact) => {
            if (contact.email && contact.email.trim().length > 0) {
              ccEmails.push(contact.email.trim())
            }
          })
        }

        if (ccEmails.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `No valid contact person email addresses found for sponsor ${sfc.sponsor.name}. Please add contact persons with valid email addresses in the sponsor CRM.`,
          })
        }

        const discountInfo = `
          <div style="background-color: #E0F2FE; padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid #CBD5E1;">
            <h3 style="color: #1D4ED8; margin-top: 0; margin-bottom: 16px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 18px; font-weight: 600;">
              Your Discount Code
            </h3>
            <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 15px; line-height: 1.6;">
              <li style="margin-bottom: 8px;"><strong>Discount Code:</strong> <code style="background-color: #F1F5F9; padding: 4px 8px; border-radius: 4px; font-family: Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;">${input.discountCode}</code></li>
              <li style="margin-bottom: 8px;"><strong>Ticket Registration:</strong> <a href="${input.ticketUrl}" style="color: #1D4ED8; text-decoration: none; font-weight: 500;">${input.ticketUrl}</a></li>
              <li style="margin-bottom: 0;"><strong>Instructions:</strong> Enter the discount code during checkout to receive your sponsor tickets</li>
            </ul>
          </div>
        `

        const emailResponse = await sendIndividualEmail({
          conference,
          subject: input.subject,
          messagePortableText,
          primaryRecipient: ccEmails[0],
          ccRecipients: ccEmails.slice(1),
          additionalContent: discountInfo,
          fromEmail: conference.sponsorEmail
            ? `${conference.organizer || 'Cloud Native Days'} <${conference.sponsorEmail}>`
            : undefined,
        })

        if (!emailResponse.ok) {
          const errorData = await emailResponse.json()
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: errorData.error || 'Failed to send discount email',
          })
        }

        const responseData = await emailResponse.json()
        return {
          ...responseData,
          sponsorName: sfc.sponsor.name,
          discountCode: input.discountCode,
        }
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
          await getConferenceForCurrentDomain({ sponsors: true })
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
        return { success: true }
      }),

    getSigningProviderStatus: adminProcedure.query(async () => {
      const { conference, error } = await getConferenceForCurrentDomain()
      if (error || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get current conference',
          cause: error,
        })
      }
      const provider = getSigningProvider(conference.signingProvider)
      const status = await provider.getConnectionStatus()
      return {
        connected: status.connected,
        expiresAt: status.expiresAt ?? null,
        apiAccessPoint: status.detail ?? null,
        webhookActive: status.webhookActive ?? null,
        providerName: status.providerName,
        signingProvider: conference.signingProvider ?? 'self-hosted',
      }
    }),

    getAdobeSignAuthorizeUrl: adminProcedure.query(async () => {
      const { conference, domain, error } =
        await getConferenceForCurrentDomain()
      if (error || !conference || !domain) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get current conference',
          cause: error,
        })
      }
      const origin = `https://${domain}`
      const redirectUri = `${origin}/api/adobe-sign/callback`
      const provider = getSigningProvider(conference.signingProvider)
      return provider.getAuthorizeUrl(redirectUri)
    }),

    disconnectAdobeSign: adminProcedure.mutation(async () => {
      const { conference, error } = await getConferenceForCurrentDomain()
      if (error || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get current conference',
          cause: error,
        })
      }
      const provider = getSigningProvider(conference.signingProvider)
      await provider.disconnect()
      return { success: true }
    }),

    registerAdobeSignWebhook: adminProcedure
      .input(WebhookUrlSchema)
      .mutation(async ({ input }) => {
        const { conference, error } = await getConferenceForCurrentDomain()
        if (error || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: error,
          })
        }
        const provider = getSigningProvider(conference.signingProvider)
        return provider.registerWebhook(input.webhookUrl)
      }),

    updateSigningProvider: adminProcedure
      .input(
        z.object({
          signingProvider: z.enum(['self-hosted', 'adobe-sign']),
        }),
      )
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        await clientWrite
          .patch(conferenceId)
          .set({ signingProvider: input.signingProvider })
          .commit()
        return { success: true }
      }),
  }),
})
