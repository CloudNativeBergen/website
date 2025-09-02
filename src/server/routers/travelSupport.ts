/**
 * tRPC Router for Travel Support Management
 * Handles travel support requests, expenses, and administrative operations
 */

import { TRPCError } from '@trpc/server'
import { router, adminProcedure, protectedProcedure } from '../trpc'
import {
  GetTravelSupportSchema,
  GetTravelSupportByIdSchema,
  TravelSupportClientInputSchema,
  UpdateBankingDetailsSchema,
  AddExpenseSchema,
  UpdateExpenseSchema,
  DeleteExpenseSchema,
  DeleteReceiptSchema,
  UpdateExpenseStatusSchema,
  UpdateTravelSupportStatusSchema,
  SubmitTravelSupportSchema,
} from '../schemas/travelSupport'

import {
  getTravelSupport,
  getTravelSupportById,
  getAllTravelSupport,
  createTravelSupport,
  updateBankingDetails,
  submitTravelSupport,
  updateTravelSupportStatus,
  addTravelExpense,
  updateTravelExpense,
  updateExpenseStatus,
  deleteTravelExpense,
  deleteExpense,
  deleteReceipt,
} from '@/lib/travel-support/sanity'

import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { TravelExpense } from '@/lib/travel-support/types'
import {
  checkSpeakerEligibility,
  authorizeTravelSupportOperation,
  auditLog,
  createAuthError,
  canAddExpenses,
  verifyTravelSupportOwnership,
} from '@/lib/travel-support/auth'
import { clientReadUncached as clientRead } from '@/lib/sanity/client'

export const travelSupportRouter = router({
  // Get travel support for current speaker
  getMine: protectedProcedure.query(async ({ ctx }) => {
    try {
      const { conference, error: confError } =
        await getConferenceForCurrentDomain()
      if (confError || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get current conference',
          cause: confError,
        })
      }

      // Check if speaker is eligible for travel funding
      const { isEligible, error: eligibilityError } =
        await checkSpeakerEligibility(ctx.speaker._id)

      if (!isEligible) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not eligible for travel funding',
          cause: eligibilityError,
        })
      }

      const { travelSupport, error } = await getTravelSupport(
        ctx.speaker._id,
        conference._id,
      )

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch travel support',
          cause: error,
        })
      }

      return travelSupport
    } catch (error) {
      if (error instanceof TRPCError) throw error

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected error fetching travel support',
        cause: error,
      })
    }
  }),

  // Get travel support by ID (admin only)
  getById: adminProcedure
    .input(GetTravelSupportByIdSchema)
    .query(async ({ input }) => {
      try {
        const { travelSupport, error } = await getTravelSupportById(input.id)

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch travel support',
            cause: error,
          })
        }

        if (!travelSupport) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Travel support request not found',
          })
        }

        return travelSupport
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error fetching travel support',
          cause: error,
        })
      }
    }),

  // List all travel support requests (admin only)
  list: adminProcedure
    .input(GetTravelSupportSchema)
    .query(async ({ input }) => {
      try {
        const { conference, error: confError } =
          await getConferenceForCurrentDomain()
        if (confError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: confError,
          })
        }

        const conferenceId = input.conferenceId || conference._id
        const { travelSupports, error } =
          await getAllTravelSupport(conferenceId)

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch travel support requests',
            cause: error,
          })
        }

        return travelSupports
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error fetching travel support requests',
          cause: error,
        })
      }
    }),

  // Create travel support request
  create: protectedProcedure
    .input(TravelSupportClientInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Ensure speaker is creating for themselves
        if (input.speaker._ref !== ctx.speaker._id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only create travel support for yourself',
          })
        }

        // Get current conference from domain (multi-tenant)
        const { conference, error: confError } =
          await getConferenceForCurrentDomain()
        if (confError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: confError,
          })
        }

        // Check if speaker is eligible for travel funding
        const { isEligible, error: eligibilityError } =
          await checkSpeakerEligibility(ctx.speaker._id)

        if (!isEligible) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You are not eligible for travel funding',
            cause: eligibilityError,
          })
        }

        // Construct full input with resolved conference
        const fullInput = {
          ...input,
          conference: { _ref: conference._id, _type: 'reference' as const },
        }

        const { travelSupport, error } = await createTravelSupport(fullInput)

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create travel support request',
            cause: error,
          })
        }

        return travelSupport
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error creating travel support request',
          cause: error,
        })
      }
    }),

  // Update banking details
  updateBankingDetails: protectedProcedure
    .input(UpdateBankingDetailsSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Use enhanced authorization
        const { authorized, error: authError } =
          await authorizeTravelSupportOperation(
            input.travelSupportId,
            ctx.speaker._id,
            ctx.speaker.is_organizer,
            'modify',
          )

        if (!authorized || authError) {
          throw authError || createAuthError('FORBIDDEN', 'Access denied')
        }

        // Log banking details update for audit purposes
        auditLog('Banking Details Update', ctx.speaker._id, ctx.speaker.name, {
          travelSupportId: input.travelSupportId,
          isAdmin: ctx.speaker.is_organizer,
        })

        const { success, error } = await updateBankingDetails(
          input.travelSupportId,
          input.bankingDetails,
        )

        if (!success || error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update banking details',
            cause: error,
          })
        }

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error updating banking details',
          cause: error,
        })
      }
    }),

  // Submit travel support for review
  submit: protectedProcedure
    .input(SubmitTravelSupportSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Use enhanced authorization
        const {
          authorized,
          travelSupport,
          error: authError,
        } = await authorizeTravelSupportOperation(
          input.travelSupportId,
          ctx.speaker._id,
          ctx.speaker.is_organizer,
          'submit',
        )

        if (!authorized || authError) {
          throw authError || createAuthError('FORBIDDEN', 'Access denied')
        }

        // Validate that banking details are complete before submission
        if (!travelSupport?.bankingDetails) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Banking details are required before submission',
          })
        }

        const banking = travelSupport.bankingDetails
        if (
          !banking.beneficiaryName ||
          !banking.bankName ||
          !banking.swiftCode ||
          !banking.country ||
          (!banking.iban && !banking.accountNumber)
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Please complete all banking details before submission',
          })
        }

        const { success, error } = await submitTravelSupport(
          input.travelSupportId,
        )

        if (!success || error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to submit travel support request',
            cause: error,
          })
        }

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error submitting travel support request',
          cause: error,
        })
      }
    }),

  // Update travel support status (admin only)
  updateStatus: adminProcedure
    .input(UpdateTravelSupportStatusSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Verify the travel support exists and get current status for audit
        const { travelSupport, error: fetchError } = await getTravelSupportById(
          input.travelSupportId,
        )

        if (fetchError || !travelSupport) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Travel support request not found',
            cause: fetchError,
          })
        }

        // Log status change for audit purposes
        auditLog(
          'Travel Support Status Update',
          ctx.speaker._id,
          ctx.speaker.name,
          {
            travelSupportId: input.travelSupportId,
            speakerId: travelSupport.speaker._ref,
            oldStatus: travelSupport.status,
            newStatus: input.status,
            approvedAmount: input.approvedAmount,
            reviewNotes: input.reviewNotes,
          },
        )

        const { success, error } = await updateTravelSupportStatus(
          input.travelSupportId,
          input.status,
          ctx.speaker._id,
          input.approvedAmount,
          input.reviewNotes,
        )

        if (!success || error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update travel support status',
            cause: error,
          })
        }

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error updating travel support status',
          cause: error,
        })
      }
    }),

  // Add expense
  addExpense: protectedProcedure
    .input(AddExpenseSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Verify ownership
        const {
          travelSupport,
          hasAccess,
          error: accessError,
        } = await verifyTravelSupportOwnership(
          input.travelSupportId,
          ctx.speaker._id,
          ctx.speaker.is_organizer,
        )

        if (accessError || !hasAccess || !travelSupport) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'You can only add expenses to your own travel support request',
            cause: accessError,
          })
        }

        // Check if expenses can be added based on status
        if (!canAddExpenses(travelSupport.status)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Cannot add expenses when request is ${travelSupport.status}`,
          })
        }

        const { expense, error } = await addTravelExpense(
          input.travelSupportId,
          input.expense,
        )

        if (!expense || error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to add expense',
            cause: error,
          })
        }

        return expense
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error adding expense',
          cause: error,
        })
      }
    }),

  // Update expense (speaker only, for draft travel support)
  updateExpense: protectedProcedure
    .input(UpdateExpenseSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Get the expense first to get the travel support ID
        const existingExpense = await clientRead.fetch<TravelExpense>(
          `*[_type == "travelExpense" && _id == $expenseId][0] {
            ...,
            travelSupport
          }`,
          { expenseId: input.expenseId },
        )

        if (!existingExpense) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Expense not found',
          })
        }

        if (!existingExpense.travelSupport?._ref) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Expense does not have a valid travel support reference',
          })
        }

        // Verify ownership
        const {
          travelSupport,
          hasAccess,
          error: accessError,
        } = await verifyTravelSupportOwnership(
          existingExpense.travelSupport._ref,
          ctx.speaker._id,
          ctx.speaker.is_organizer,
        )

        if (accessError || !hasAccess || !travelSupport) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only update your own expenses',
            cause: accessError,
          })
        }

        // Check if expenses can be updated based on status
        if (!canAddExpenses(travelSupport.status)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Cannot update expenses when request is ${travelSupport.status}`,
          })
        }

        const { expense, error } = await updateTravelExpense(
          input.expenseId,
          input.expense,
        )

        if (!expense || error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update expense',
            cause: error,
          })
        }

        return expense
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error updating expense',
          cause: error,
        })
      }
    }),

  // Update expense status (admin only)
  updateExpenseStatus: adminProcedure
    .input(UpdateExpenseStatusSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Log expense status change for audit purposes
        auditLog('Expense Status Update', ctx.speaker._id, ctx.speaker.name, {
          expenseId: input.expenseId,
          newStatus: input.status,
          reviewNotes: input.reviewNotes,
        })

        const { success, error } = await updateExpenseStatus(
          input.expenseId,
          input.status,
          input.reviewNotes,
        )

        if (!success || error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update expense status',
            cause: error,
          })
        }

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error updating expense status',
          cause: error,
        })
      }
    }),

  // Delete expense
  deleteExpense: protectedProcedure
    .input(DeleteExpenseSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // First, get the expense to find its travel support relationship
        const expense = await clientRead.fetch<{
          travelSupport: { _ref: string }
        }>(
          `*[_type == "travelExpense" && _id == $expenseId][0] {
            travelSupport
          }`,
          { expenseId: input.expenseId },
        )

        if (!expense?.travelSupport?._ref) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Expense not found',
          })
        }

        // Verify travel support ownership
        const {
          travelSupport,
          hasAccess,
          error: accessError,
        } = await verifyTravelSupportOwnership(
          expense.travelSupport._ref,
          ctx.speaker._id,
          ctx.speaker.is_organizer,
        )

        if (accessError || !hasAccess || !travelSupport) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'You can only delete expenses from your own travel support request',
            cause: accessError,
          })
        }

        // Check if expenses can be modified based on status
        if (!canAddExpenses(travelSupport.status)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Cannot delete expenses when request is ${travelSupport.status}`,
          })
        }

        const { success, error } = await deleteTravelExpense(input.expenseId)

        if (!success || error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete expense',
            cause: error,
          })
        }

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error deleting expense',
          cause: error,
        })
      }
    }),

  // Delete receipt from expense (speaker only, for draft travel support)
  deleteReceipt: protectedProcedure
    .input(DeleteReceiptSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Get the expense first to get the travel support ID
        const existingExpense = await clientRead.fetch<TravelExpense>(
          `*[_type == "travelExpense" && _id == $expenseId][0] {
            ...,
            travelSupport
          }`,
          { expenseId: input.expenseId },
        )

        if (!existingExpense) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Expense not found',
          })
        }

        if (!existingExpense.travelSupport?._ref) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Expense does not have a valid travel support reference',
          })
        }

        // Verify ownership
        const {
          travelSupport,
          hasAccess,
          error: accessError,
        } = await verifyTravelSupportOwnership(
          existingExpense.travelSupport._ref,
          ctx.speaker._id,
          ctx.speaker.is_organizer,
        )

        if (accessError || !hasAccess || !travelSupport) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only delete receipts from your own expenses',
            cause: accessError,
          })
        }

        // Check if expenses can be modified based on status
        if (!canAddExpenses(travelSupport.status)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Cannot delete receipts when request is ${travelSupport.status}`,
          })
        }

        const { success, error } = await deleteReceipt(
          input.expenseId,
          input.receiptIndex,
        )

        if (!success || error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete receipt',
            cause: error,
          })
        }

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error deleting receipt',
          cause: error,
        })
      }
    }),
})
