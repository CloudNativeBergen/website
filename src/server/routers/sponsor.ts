import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { revalidateTag } from 'next/cache'
import { router, adminProcedure } from '../trpc'
import {
  SponsorInputSchema,
  SponsorUpdateSchema,
  SponsorSearchSchema,
  IdParamSchema,
  SponsorTierInputSchema,
  SponsorTierUpdateSchema,
  ConferenceSponsorInputSchema,
  SponsorTierAssignmentSchema,
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
  addSponsorToConference,
  removeSponsorFromConference,
  updateSponsorTierAssignment,
} from '@/lib/sponsor/sanity'
import { validateSponsor, validateSponsorTier } from '@/lib/sponsor/validation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { updateSponsorAudience } from '@/lib/sponsor/audience'
import { clientWrite } from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import type {
  SponsorTierExisting,
  SponsorWithContactInfo,
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
  copySponsorsFromPreviousYear,
} from '@/lib/sponsor-crm/sanity'
import {
  logStageChange,
  logInvoiceStatusChange,
  logContractStatusChange,
} from '@/lib/sponsor-crm/activity'
import {
  SponsorForConferenceInputSchema,
  SponsorForConferenceUpdateSchema,
  SponsorForConferenceIdSchema,
  MoveStageSchema,
  UpdateInvoiceStatusSchema,
  CopySponsorsSchema,
} from '@/server/schemas/sponsorForConference'
import {
  listActivitiesForSponsor,
  listActivitiesForConference,
} from '@/lib/sponsor-crm/activities'

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
        tier_type,
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
        sold_out,
        most_popular
      }`,
      params,
    )

    return { sponsorTiers }
  } catch (error) {
    return { error: error as Error }
  }
}

export const sponsorRouter = router({
  list: adminProcedure.input(SponsorSearchSchema).query(async ({ input }) => {
    try {
      let result
      if (input.query) {
        result = await searchSponsors(input.query, input.includeContactInfo)
      } else {
        result = await getAllSponsors(input.includeContactInfo)
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

        try {
          const { conference } = await getConferenceForCurrentDomain()
          if (conference && sponsor) {
            const audienceResult = await updateSponsorAudience(
              conference,
              null,
              sponsor,
            )

            if (!audienceResult.success) {
              console.warn(
                `Failed to update sponsor audience for new sponsor ${sponsor.name}:`,
                audienceResult.error,
              )
            }
          }
        } catch (audienceError) {
          console.warn(
            'Failed to sync sponsor audience, but sponsor was created:',
            audienceError,
          )
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
          const { sponsor: existingSponsor } = await getSponsor(input.id, true)
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

          try {
            const { conference } = await getConferenceForCurrentDomain()
            if (conference && existingSponsor && sponsor) {
              const audienceResult = await updateSponsorAudience(
                conference,
                existingSponsor as SponsorWithContactInfo,
                sponsor,
              )

              if (!audienceResult.success) {
                console.warn(
                  `Failed to update sponsor audience for updated sponsor ${sponsor.name}:`,
                  audienceResult.error,
                )
              }
            }
          } catch (audienceError) {
            console.warn(
              'Failed to sync sponsor audience, but sponsor was updated:',
              audienceError,
            )
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

        revalidateTag('content:sponsor', 'page')
        revalidateTag('content:conferences', 'page')

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

          const mergedData = { ...existingTier, ...input.data }
          const validationErrors = validateSponsorTier(mergedData)
          if (validationErrors.length > 0) {
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

          revalidateTag('content:sponsor', 'page')
          revalidateTag('content:conferences', 'page')

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
        })
      }

      revalidateTag('content:sponsor', 'page')
      revalidateTag('content:conferences', 'page')

      return { success: true }
    }),
  }),

  addToConference: adminProcedure
    .input(ConferenceSponsorInputSchema)
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

      const { error } = await addSponsorToConference(
        conference._id,
        input.sponsorId,
        input.tierId,
      )

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add sponsor to conference',
          cause: error,
        })
      }

      return { success: true }
    }),

  updateTierAssignment: adminProcedure
    .input(SponsorTierAssignmentSchema)
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

      const { error } = await updateSponsorTierAssignment(
        conference._id,
        input.sponsorName,
        input.tierId,
      )

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update sponsor tier assignment',
          cause: error,
        })
      }

      return { success: true }
    }),

  removeFromConference: adminProcedure
    .input(IdParamSchema)
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

      const { error } = await removeSponsorFromConference(
        conference._id,
        input.id,
      )

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to remove sponsor from conference',
          cause: error,
        })
      }

      return { success: true }
    }),

  crm: router({
    listOrganizers: adminProcedure.query(async () => {
      const { getOrganizers } = await import('@/lib/speaker/sanity')
      const { speakers, err } = await getOrganizers()

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
          invoice_status: z.array(z.string()).optional(),
          assigned_to: z.string().optional(),
          tags: z.array(z.string()).optional(),
          tiers: z.array(z.string()).optional(),
        }),
      )
      .query(async ({ input }) => {
        const { sponsors, error } = await listSponsorsForConference(
          input.conferenceId,
          {
            status: input.status,
            invoice_status: input.invoice_status,
            assigned_to: input.assigned_to,
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
      .mutation(async ({ input }) => {
        const { sponsorForConference, error } =
          await createSponsorForConference({
            ...input,
            tags: input.tags as SponsorTag[] | undefined,
          })

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create sponsor relationship',
            cause: error,
          })
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
            assigned_to:
              updateData.assigned_to === null
                ? undefined
                : updateData.assigned_to,
            contact_initiated_at:
              updateData.contact_initiated_at === null
                ? undefined
                : updateData.contact_initiated_at,
            contract_signed_at:
              updateData.contract_signed_at === null
                ? undefined
                : updateData.contract_signed_at,
            contract_value:
              updateData.contract_value === null
                ? undefined
                : updateData.contract_value,
            invoice_sent_at:
              updateData.invoice_sent_at === null
                ? undefined
                : updateData.invoice_sent_at,
            invoice_paid_at:
              updateData.invoice_paid_at === null
                ? undefined
                : updateData.invoice_paid_at,
            notes: updateData.notes === null ? undefined : updateData.notes,
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
          if (updateData.status && updateData.status !== existing.status) {
            await logStageChange(id, existing.status, updateData.status, userId)
          }

          if (
            updateData.invoice_status &&
            updateData.invoice_status !== existing.invoice_status
          ) {
            await logInvoiceStatusChange(
              id,
              existing.invoice_status,
              updateData.invoice_status,
              userId,
            )
          }

          if (
            updateData.contract_status &&
            updateData.contract_status !== existing.contract_status
          ) {
            await logContractStatusChange(
              id,
              existing.contract_status,
              updateData.contract_status,
              userId,
            )
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
          await logStageChange(input.id, oldStatus, input.newStatus, userId)
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

        const oldStatus = existing.invoice_status
        const updateData: Partial<{
          invoice_status: string
          invoice_sent_at: string | null
          invoice_paid_at: string | null
        }> = {
          invoice_status: input.newStatus,
        }

        if (input.newStatus === 'sent' && !existing.invoice_sent_at) {
          updateData.invoice_sent_at = getCurrentDateTime()
        }

        if (input.newStatus === 'paid' && !existing.invoice_paid_at) {
          updateData.invoice_paid_at = getCurrentDateTime()
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
          await logInvoiceStatusChange(
            input.id,
            oldStatus,
            input.newStatus,
            userId,
          )
        }

        return sponsorForConference
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

    activities: router({
      list: adminProcedure
        .input(z.object({ sponsorForConferenceId: z.string().min(1) }))
        .query(async ({ input }) => {
          const { activities, error } = await listActivitiesForSponsor(
            input.sponsorForConferenceId,
          )

          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to list activities',
              cause: error,
            })
          }

          return activities || []
        }),

      listForConference: adminProcedure
        .input(
          z.object({
            conferenceId: z.string().min(1),
            limit: z.number().optional(),
          }),
        )
        .query(async ({ input }) => {
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
        }),
    }),
  }),
})
