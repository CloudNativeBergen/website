import { TRPCError } from '@trpc/server'
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
import type {
  SponsorTierExisting,
  SponsorWithContactInfo,
} from '@/lib/sponsor/types'

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

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { tierId: _, ...sponsorData } = mergedData
          const { sponsor, error } = await updateSponsor(input.id, sponsorData)

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
})
