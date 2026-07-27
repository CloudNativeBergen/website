import { TRPCError } from '@trpc/server'

import {
  BudgetNotFoundError,
  createBudgetForConference,
  getBudgetForConference,
  patchBudgetForConference,
} from '@/lib/budget/sanity'
import { ensureUniqueArrayKeys } from '@/lib/sanity/helpers'
import {
  UpdateConfigSchema,
  UpdateExpensesSchema,
  UpdateScenariosSchema,
  UpdateSponsorAssumptionsSchema,
  UpdateTicketTypesSchema,
} from '../schemas/budget'
import { adminProcedure, resolveConferenceId, router } from '../trpc'

/**
 * Budget module router (M1).
 *
 * All procedures are org-scoped through `adminProcedure` (the authorization
 * waist) and resolve the conference from the request domain via
 * `resolveConferenceId()` - budget documents are never addressed by
 * client-supplied ids.
 *
 * Reads of the budget document are uncached (see `@/lib/budget/sanity`),
 * so mutations do not need tag revalidation; the client refreshes the
 * server-rendered page after a save.
 */

function wrapUnknown(error: unknown, message: string): never {
  if (error instanceof TRPCError) throw error
  if (error instanceof BudgetNotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: error.message })
  }
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message,
    cause: error,
  })
}

export const budgetRouter = router({
  get: adminProcedure.query(async () => {
    const conferenceId = await resolveConferenceId()
    try {
      return { budget: await getBudgetForConference(conferenceId) }
    } catch (error) {
      wrapUnknown(error, 'Failed to load budget')
    }
  }),

  create: adminProcedure.mutation(async () => {
    const conferenceId = await resolveConferenceId()
    try {
      return { budget: await createBudgetForConference(conferenceId) }
    } catch (error) {
      wrapUnknown(error, 'Failed to create budget')
    }
  }),

  updateExpenses: adminProcedure
    .input(UpdateExpensesSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      try {
        const budget = await patchBudgetForConference(conferenceId, {
          variableCosts: ensureUniqueArrayKeys(input.variableCosts, 'varcost'),
          fixedCosts: ensureUniqueArrayKeys(input.fixedCosts, 'fixedcost'),
        })
        return { success: true, budget }
      } catch (error) {
        wrapUnknown(error, 'Failed to update expenses')
      }
    }),

  updateTicketTypes: adminProcedure
    .input(UpdateTicketTypesSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      try {
        const budget = await patchBudgetForConference(conferenceId, {
          ticketTypes: ensureUniqueArrayKeys(input.ticketTypes, 'tickettype'),
        })
        return { success: true, budget }
      } catch (error) {
        wrapUnknown(error, 'Failed to update ticket types')
      }
    }),

  updateSponsorAssumptions: adminProcedure
    .input(UpdateSponsorAssumptionsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      try {
        const budget = await patchBudgetForConference(conferenceId, {
          sponsorTierAssumptions: ensureUniqueArrayKeys(
            input.sponsorTierAssumptions,
            'sponsortier',
          ),
          sponsorAddonAssumptions: ensureUniqueArrayKeys(
            input.sponsorAddonAssumptions,
            'sponsoraddon',
          ),
        })
        return { success: true, budget }
      } catch (error) {
        wrapUnknown(error, 'Failed to update sponsor assumptions')
      }
    }),

  updateConfig: adminProcedure
    .input(UpdateConfigSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      try {
        const budget = await patchBudgetForConference(conferenceId, {
          vatRate: input.vatRate,
          ticketingFeeRate: input.ticketingFeeRate,
          dinnerParticipation: input.dinnerParticipation,
        })
        return { success: true, budget }
      } catch (error) {
        wrapUnknown(error, 'Failed to update budget configuration')
      }
    }),

  updateScenarios: adminProcedure
    .input(UpdateScenariosSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      try {
        // Each scenario AND its nested count arrays are keyed for Sanity.
        const scenarios = ensureUniqueArrayKeys(
          input.scenarios,
          'scenario',
        ).map((scenario) => ({
          ...scenario,
          ticketCounts: ensureUniqueArrayKeys(
            scenario.ticketCounts ?? [],
            'ticket',
          ),
          tierCounts: ensureUniqueArrayKeys(scenario.tierCounts ?? [], 'tier'),
          addonCounts: ensureUniqueArrayKeys(
            scenario.addonCounts ?? [],
            'addon',
          ),
          cutCosts: scenario.cutCosts ?? [],
        }))
        const budget = await patchBudgetForConference(conferenceId, {
          scenarios,
        })
        return { success: true, budget }
      } catch (error) {
        wrapUnknown(error, 'Failed to update scenarios')
      }
    }),
})
