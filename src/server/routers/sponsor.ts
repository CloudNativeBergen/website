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
import { clientWrite } from '@/lib/sanity/client'
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
import { checkContractReadiness } from '@/lib/sponsor-crm/contract-readiness'
import { UpdateSignatureStatusSchema } from '@/server/schemas/sponsorForConference'
import {
  uploadTransientDocument,
  createAgreement,
  getAgreement,
  downloadSignedDocument,
} from '@/lib/adobe-sign'

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
        try {
          return await bulkDeleteSponsors(input.ids)
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
      .input(SponsorForConferenceIdSchema)
      .mutation(async ({ input }) => {
        const { error } = await deleteSponsorForConference(input.id)

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
        const { sponsorForConference: sfc } = await getSponsorForConference(
          input.id,
        )
        if (!sfc) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
          })
        }

        if (!sfc.signatureId) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'No signing agreement found for this contract',
          })
        }

        const agreement = await getAgreement(sfc.signatureId)
        const currentStatus = sfc.signatureStatus || 'not-started'

        const statusMap: Record<string, string> = {
          SIGNED: 'signed',
          OUT_FOR_SIGNATURE: 'pending',
          EXPIRED: 'expired',
          CANCELLED: 'rejected',
        }
        const newStatus = statusMap[agreement.status] || currentStatus

        if (newStatus !== currentStatus) {
          const updateFields: Record<string, unknown> = {
            signatureStatus: newStatus,
          }
          if (newStatus === 'signed') {
            updateFields.contractStatus = 'contract-signed'
            updateFields.contractSignedAt = getCurrentDateTime()

            // Download signed PDF and store it
            try {
              const signedPdf = await downloadSignedDocument(sfc.signatureId)
              const signedFilename = `signed-contract-${sfc.signatureId}.pdf`
              const asset = await clientWrite.assets.upload(
                'file',
                Buffer.from(signedPdf),
                { filename: signedFilename, contentType: 'application/pdf' },
              )
              updateFields.contractDocument = {
                _type: 'file',
                asset: { _type: 'reference', _ref: asset._id },
              }
            } catch (downloadError) {
              console.error('Failed to download signed PDF:', downloadError)
            }
          }

          await clientWrite.patch(input.id).set(updateFields).commit()

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
              console.error('Failed to log signature status change:', logError)
            }
          }
        }

        return {
          signatureStatus: newStatus,
          agreementStatus: agreement.status,
          changed: newStatus !== currentStatus,
        }
      }),

    updateSignatureStatus: adminProcedure
      .input(UpdateSignatureStatusSchema)
      .mutation(async ({ input, ctx }) => {
        const { sponsorForConference: existing } =
          await getSponsorForConference(input.id)

        if (!existing) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
          })
        }

        const oldStatus = existing.signatureStatus || 'not-started'

        // Atomic update: set signatureStatus and conditionally set contract fields
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
            console.error('Failed to log signature status change:', logError)
          }
        }

        const { sponsorForConference } = await getSponsorForConference(input.id)
        return sponsorForConference
      }),

    sendContract: adminProcedure
      .input(SendContractSchema)
      .mutation(async ({ input, ctx }) => {
        const { sponsorForConference: sfc, error: sfcError } =
          await getSponsorForConference(input.sponsorForConferenceId)
        if (sfcError || !sfc) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sponsor relationship not found',
            cause: sfcError,
          })
        }

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

        if (!sfc.conference?.title) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Conference title is required for contract generation',
          })
        }

        const primaryContact =
          sfc.contactPersons?.find(
            (c: { isPrimary?: boolean }) => c.isPrimary,
          ) || sfc.contactPersons?.[0]
        if (!primaryContact?.name || !primaryContact?.email) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'A contact person with name and email is required',
          })
        }

        // Generate the PDF
        const pdfBuffer = await generateContractPdf(template, {
          sponsor: {
            name: sfc.sponsor.name,
            orgNumber: sfc.sponsor.orgNumber,
            address: sfc.sponsor.address,
            website: sfc.sponsor.website,
          },
          contactPerson: primaryContact
            ? { name: primaryContact.name, email: primaryContact.email }
            : undefined,
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

        const filename = `contract-${sfc.sponsor.name.toLowerCase().replace(/\s+/g, '-')}.pdf`

        // Upload PDF to Sanity as a file asset
        const asset = await clientWrite.assets.upload('file', pdfBuffer, {
          filename,
          contentType: 'application/pdf',
        })

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
          updateFields.signerEmail = input.signerEmail
          updateFields.signatureStatus = 'pending'
        }

        // Send to Adobe Sign for digital signing if signer email is provided
        let agreementId: string | undefined
        if (input.signerEmail) {
          try {
            const transientDoc = await uploadTransientDocument(
              pdfBuffer,
              filename,
            )
            const agreement = await createAgreement({
              name: `Sponsorship Agreement - ${sfc.sponsor.name}`,
              participantEmail: input.signerEmail,
              message: `Please sign the sponsorship agreement for ${sfc.conference?.title || 'Cloud Native Days Norway'}.`,
              fileInfos: [
                { transientDocumentId: transientDoc.transientDocumentId },
              ],
            })
            agreementId = agreement.id
            updateFields.signatureId = agreementId
          } catch (signError) {
            console.error('Adobe Sign agreement creation failed:', signError)
            // Continue without signing — contract is still sent
          }
        }

        await clientWrite
          .patch(input.sponsorForConferenceId)
          .set(updateFields)
          .commit()

        // Log activity
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
            console.error('Failed to log contract send activity:', logError)
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
              console.error('Failed to log signature status change:', logError)
            }
          }
        }

        return {
          success: true,
          pdf: pdfBuffer.toString('base64'),
          filename,
          agreementId,
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
          tier: data.tier === null ? '' : data.tier,
          currency: data.currency === null ? undefined : data.currency,
          headerText: data.headerText === null ? '' : data.headerText,
          footerText: data.footerText === null ? '' : data.footerText,
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

        const template = {
          _id: 'preview',
          _createdAt: new Date().toISOString(),
          _updatedAt: new Date().toISOString(),
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
  }),
})
