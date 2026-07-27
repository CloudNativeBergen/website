import { z } from 'zod'

import { EXPENSE_CATEGORIES, VARIABLE_COST_BASES } from '@/lib/budget/model'

/** Zod schemas for the budget router (budget module M1). */

export const ExpenseCategorySchema = z.enum(EXPENSE_CATEGORIES)

export const VariableCostBasisSchema = z.enum(VARIABLE_COST_BASES)

const nonNegative = (label: string) =>
  z.number().min(0, `${label} cannot be negative`)

export const BudgetVariableCostSchema = z.object({
  _key: z.string().optional(),
  name: z.string().trim().min(1, 'Name is required'),
  category: ExpenseCategorySchema,
  amountPerPerson: nonNegative('Amount per person'),
  basis: VariableCostBasisSchema,
  actualAmount: nonNegative('Actual amount').nullish(),
})

export const BudgetFixedCostSchema = z.object({
  _key: z.string().optional(),
  name: z.string().trim().min(1, 'Name is required'),
  category: ExpenseCategorySchema,
  amount: nonNegative('Amount'),
  optional: z.boolean(),
  actualAmount: nonNegative('Actual amount').nullish(),
})

export const UpdateExpensesSchema = z.object({
  variableCosts: z.array(BudgetVariableCostSchema),
  fixedCosts: z.array(BudgetFixedCostSchema),
})

export const BudgetTicketTypeSchema = z.object({
  _key: z.string().optional(),
  name: z.string().trim().min(1, 'Name is required'),
  priceInclVat: nonNegative('Price'),
  attendsConference: z.boolean(),
  attendsWorkshop: z.boolean(),
  workshopCrew: z.boolean(),
  sponsorIncluded: z.boolean().optional(),
  actualCount: z.number().int().min(0, 'Count cannot be negative').nullish(),
})

export const UpdateTicketTypesSchema = z.object({
  ticketTypes: z
    .array(BudgetTicketTypeSchema)
    .superRefine((ticketTypes, ctx) => {
      if (ticketTypes.filter((t) => t.sponsorIncluded).length > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'At most one ticket type can be sponsor-included',
        })
      }
      // A type that is both a workshop attendee and workshop-day crew would
      // be double-counted in every workshop-basis variable cost.
      if (ticketTypes.some((t) => t.attendsWorkshop && t.workshopCrew)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'A ticket type cannot be both a workshop attendee and workshop-day crew',
        })
      }
    }),
})
