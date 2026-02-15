import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { revalidateTag } from 'next/cache'
import { router, adminProcedure } from '../trpc'
import {
  SponsorInputSchema,
  SponsorUpdateSchema,
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
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
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
} from '@/lib/sponsor-crm/sanity'
import {
  logStageChange,
  logInvoiceStatusChange,
  logContractStatusChange,
  logSponsorCreated,
  logAssignmentChange,
  logSignatureStatusChange,
} from '@/lib/sponsor-crm/activity'
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
import { UpdateSignatureStatusSchema } from '@/server/schemas/sponsorForConference'
import {
  getSigningProvider,
  type SigningProviderType,
} from '@/lib/contract-signing'

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

    listByConference: adminProcedure
      .input(z.object({ conferenceId: z.string() }))
      .query(async ({ input }) => {
        const { sponsorTiers, error } = await getAllSponsorTiers(
          input.conferenceId,
        )

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
    listOrganizers: adminProcedure
      .input(z.object({ conferenceId: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const { getOrganizers, getOrganizersByConference } =
          await import('@/lib/speaker/sanity')

        const { speakers, err } = input?.conferenceId
          ? await getOrganizersByConference(input.conferenceId)
          : await getOrganizers()

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
      .input(
        z.object({
          conferenceId: z.string().min(1),
          status: z.array(z.string()).optional(),
          invoiceStatus: z.array(z.string()).optional(),
          assignedTo: z.string().optional(),
          unassignedOnly: z.boolean().optional(),
          tags: z.array(z.string()).optional(),
          tiers: z.array(z.string()).optional(),
        }),
      )
      .query(async ({ input }) => {
        const { sponsors, error } = await listSponsorsForConference(
          input.conferenceId,
          {
            status: input.status,
            invoiceStatus: input.invoiceStatus,
            assignedTo: input.assignedTo,
            unassignedOnly: input.unassignedOnly,
            tags: input.tags,
            tiers: input.tiers,
          },
        )

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to list sponsors for conference',
            cause: error,
          })
        }

        return sponsors || []
      }),

    getById: adminProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input }) => {
        const { sponsorForConference, error } = await getSponsorForConference(
          input.id,
        )

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
        const data = {
          ...input,
          assignedTo: input.assignedTo === null ? undefined : input.assignedTo,
          tags: input.tags as SponsorTag[] | undefined,
        }

        // Auto-assign to current user if not provided
        if (!data.assignedTo && userId) {
          data.assignedTo = userId
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
          await getSponsorForConference(id)

        if (!existing) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
          })
        }

        const { sponsorForConference, error } =
          await updateSponsorForConference(id, {
            ...updateData,
            assignedTo:
              updateData.assignedTo === null
                ? undefined
                : updateData.assignedTo,
            billing:
              updateData.billing === null ? undefined : updateData.billing,
            contactInitiatedAt:
              updateData.contactInitiatedAt === null
                ? undefined
                : updateData.contactInitiatedAt,
            contractSignedAt:
              updateData.contractSignedAt === null
                ? undefined
                : updateData.contractSignedAt,
            contractValue:
              updateData.contractValue === null
                ? undefined
                : updateData.contractValue,
            invoiceSentAt:
              updateData.invoiceSentAt === null
                ? undefined
                : updateData.invoiceSentAt,
            invoicePaidAt:
              updateData.invoicePaidAt === null
                ? undefined
                : updateData.invoicePaidAt,
            notes: updateData.notes === null ? undefined : updateData.notes,
            tags: updateData.tags as SponsorTag[] | undefined,
            signerName:
              updateData.signerName === null
                ? undefined
                : updateData.signerName,
            signerEmail:
              updateData.signerEmail === null
                ? undefined
                : updateData.signerEmail,
            contractTemplate:
              updateData.contractTemplate === null
                ? undefined
                : updateData.contractTemplate,
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
          await getSponsorForConference(input.id)

        if (!existing) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
          })
        }

        const oldStatus = existing.status

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
        }

        return sponsorForConference
      }),

    updateInvoiceStatus: adminProcedure
      .input(UpdateInvoiceStatusSchema)
      .mutation(async ({ input, ctx }) => {
        const { sponsorForConference: existing } =
          await getSponsorForConference(input.id)

        if (!existing) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
          })
        }

        const oldStatus = existing.invoiceStatus
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
          await getSponsorForConference(input.id)

        if (!existing) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
          })
        }

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
          return await bulkUpdateSponsors(input, userId)
        } catch (error) {
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
            conferenceId: z.string().optional(),
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

          if (input.conferenceId) {
            const { activities, error } = await listActivitiesForConference(
              input.conferenceId,
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
          }

          return []
        }),
    }),

    checkSignatureStatus: adminProcedure
      .input(SponsorForConferenceIdSchema)
      .mutation(async ({ input, ctx }) => {
        const logCtx = `[checkSignatureStatus] sfc=${input.id}`

        const { sponsorForConference: sfc, error: sfcError } =
          await getSponsorForConference(input.id)
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
          await getSponsorForConference(input.id)

        if (!existing) {
          console.error(`${logCtx} Sponsor lookup failed:`, existingError)
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found.',
          })
        }

        const oldStatus = existing.signatureStatus || 'not-started'

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

        const { sponsorForConference } = await getSponsorForConference(input.id)
        return sponsorForConference
      }),

    sendContract: adminProcedure
      .input(SendContractSchema)
      .mutation(async ({ input, ctx }) => {
        const logCtx = `[sendContract] sfc=${input.sponsorForConferenceId}`

        const { sponsorForConference: sfc, error: sfcError } =
          await getSponsorForConference(input.sponsorForConferenceId)
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
            const signingResult = await provider.sendForSigning({
              pdf: pdfBuffer,
              filename,
              signerEmail: input.signerEmail,
              agreementName: `Sponsorship Agreement - ${sfc.sponsor.name}`,
              message: `Please sign the sponsorship agreement for ${sfc.conference.title}.`,
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
            const { ContractSigningTemplate } =
              await import('@/components/email/ContractSigningTemplate')
            const { resend, retryWithBackoff } =
              await import('@/lib/email/config')
            const { formatConferenceDateLong } = await import('@/lib/time')
            const React = await import('react')

            const contractValueStr = sfc.contractValue
              ? `${sfc.contractValue.toLocaleString()} ${sfc.contractCurrency || 'NOK'}`
              : undefined

            const signerContact = sfc.contactPersons?.find(
              (c: { email?: string }) => c.email === input.signerEmail,
            )
            const resolvedSignerName =
              signerContact?.name || primaryContact.name

            const emailElement = React.createElement(ContractSigningTemplate, {
              sponsorName: sfc.sponsor.name,
              signerName: resolvedSignerName,
              signerEmail: input.signerEmail,
              signingUrl,
              tierName: sfc.tier?.title,
              contractValue: contractValueStr,
              eventName: sfc.conference.title,
              eventLocation: sfc.conference.city || 'Norway',
              eventDate: sfc.conference.startDate
                ? formatConferenceDateLong(sfc.conference.startDate)
                : '',
              eventUrl: `https://${sfc.conference.domains?.[0] || 'cloudnativeday.no'}`,
              socialLinks: sfc.conference.socialLinks || [],
            })

            const fromEmail =
              sfc.conference.sponsorEmail || 'sponsors@cloudnativeday.no'
            const fromName = sfc.conference.organizer || 'Cloud Native Days'

            await retryWithBackoff(async () => {
              return resend.emails.send({
                from: `${fromName} <${fromEmail}>`,
                to: [input.signerEmail!],
                subject: `Sponsorship Agreement Ready for Signing — ${sfc.conference.title}`,
                react: emailElement,
              })
            })
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
    list: adminProcedure
      .input(ContractTemplateListSchema)
      .query(async ({ input }) => {
        const { templates, error } = await listContractTemplates(
          input.conferenceId,
        )
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
        const { template, error } = await findBestContractTemplate(
          input.conferenceId,
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
        const { sponsorForConference, error } = await getSponsorForConference(
          input.id,
        )
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
          await getSponsorForConference(input.sponsorForConferenceId)
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
        const { conference, error: confError } =
          await getConferenceForCurrentDomain()
        if (confError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: confError,
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
          conferenceId: z.string().min(1),
          organizerOrgNumber: z.string().optional(),
          organizerAddress: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { conference: currentConf, error: confError } =
          await getConferenceForCurrentDomain()
        if (confError || !currentConf) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: confError,
          })
        }
        if (input.conferenceId !== currentConf._id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot update a different conference.',
          })
        }

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
        await clientWrite.patch(input.conferenceId).set(fields).commit()
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
      .input(z.object({ webhookUrl: z.string().url() }))
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
          conferenceId: z.string(),
          signingProvider: z.enum(['self-hosted', 'adobe-sign']),
        }),
      )
      .mutation(async ({ input }) => {
        await clientWrite
          .patch(input.conferenceId)
          .set({ signingProvider: input.signingProvider })
          .commit()
        return { success: true }
      }),
  }),
})
