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

export const BudgetSponsorTierSchema = z.object({
  _key: z.string().optional(),
  name: z.string().trim().min(1, 'Name is required'),
  priceExVat: nonNegative('Price'),
  includedTickets: z
    .number()
    .int()
    .min(0, 'Included tickets cannot be negative'),
})

export const BudgetSponsorAddonSchema = z.object({
  _key: z.string().optional(),
  name: z.string().trim().min(1, 'Name is required'),
  priceExVat: nonNegative('Price'),
})

export const UpdateSponsorAssumptionsSchema = z.object({
  sponsorTierAssumptions: z.array(BudgetSponsorTierSchema),
  sponsorAddonAssumptions: z.array(BudgetSponsorAddonSchema),
})

/**
 * Scalar/global budget parameters. Rates are fractions (0.25 = 25%);
 * `decay` is an attendee count the model divides by, so it must be > 0.
 */
export const UpdateConfigSchema = z.object({
  vatRate: z
    .number()
    .min(0, 'VAT rate cannot be negative')
    .max(1, 'Enter the VAT rate as a fraction (0.25 = 25%)'),
  ticketingFeeRate: z
    .number()
    .min(0, 'Fee rate cannot be negative')
    .max(1, 'Enter the fee rate as a fraction (0.045 = 4.5%)'),
  dinnerParticipation: z.object({
    floor: z
      .number()
      .min(0, 'Floor cannot be negative')
      .max(1, 'Floor is a fraction (0–1)'),
    base: z
      .number()
      .min(0, 'Base cannot be negative')
      .max(1, 'Base is a fraction (0–1)'),
    decay: z.number().gt(0, 'Decay must be greater than 0'),
  }),
})

export const BudgetScenarioTicketCountSchema = z.object({
  _key: z.string().optional(),
  ticketType: z.string().min(1),
  quantity: z.number().int().min(0, 'Quantity cannot be negative'),
})

export const BudgetScenarioTierCountSchema = z.object({
  _key: z.string().optional(),
  tier: z.string().min(1),
  count: z.number().int().min(0, 'Count cannot be negative'),
})

export const BudgetScenarioAddonCountSchema = z.object({
  _key: z.string().optional(),
  addon: z.string().min(1),
  count: z.number().int().min(0, 'Count cannot be negative'),
})

export const BudgetScenarioSchema = z.object({
  _key: z.string().optional(),
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().optional(),
  ticketCounts: z.array(BudgetScenarioTicketCountSchema).optional(),
  tierCounts: z.array(BudgetScenarioTierCountSchema).optional(),
  addonCounts: z.array(BudgetScenarioAddonCountSchema).optional(),
  cutCosts: z.array(z.string()).optional(),
})

export const UpdateScenariosSchema = z.object({
  scenarios: z.array(BudgetScenarioSchema),
})
