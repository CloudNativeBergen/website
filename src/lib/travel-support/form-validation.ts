import { z, ZodError, ZodSchema } from 'zod'
import { BankingDetailsSchema, TravelExpenseInputSchema } from './validation'
import type { BankingDetails, TravelExpenseInput } from './types'

/**
 * Validation utilities that work with existing Zod schemas
 */

/**
 * Format Zod validation errors for form display
 */
export function formatZodErrors(error: ZodError): Record<string, string> {
  const errors: Record<string, string> = {}

  error.issues.forEach((issue) => {
    const path = issue.path.join('.')
    errors[path] = issue.message
  })

  return errors
}

/**
 * Validate banking details and return formatted errors
 */
export function validateBankingDetailsForm(
  values: Partial<BankingDetails>,
): Record<string, string> {
  try {
    BankingDetailsSchema.parse(values)
    return {}
  } catch (error) {
    if (error instanceof ZodError) {
      return formatZodErrors(error)
    }
    return { general: 'Validation failed' }
  }
}

/**
 * Validate expense form and return formatted errors
 */
export function validateExpenseForm(
  values: Partial<TravelExpenseInput>,
): Record<string, string> {
  try {
    TravelExpenseInputSchema.parse(values)
    return {}
  } catch (error) {
    if (error instanceof ZodError) {
      return formatZodErrors(error)
    }
    return { general: 'Validation failed' }
  }
}

/**
 * Check if a field has an error
 */
export function hasFieldError(
  errors: Record<string, string>,
  field: string,
): boolean {
  return Boolean(errors[field])
}

/**
 * Get field error message
 */
export function getFieldError(
  errors: Record<string, string>,
  field: string,
): string | undefined {
  return errors[field]
}

/**
 * Check if any validation errors exist
 */
export function hasValidationErrors(errors: Record<string, string>): boolean {
  return Object.keys(errors).length > 0
}

/**
 * Validate a single field
 */
export function validateField<T>(
  schema: ZodSchema<T>,
  values: T,
  fieldName: keyof T,
): string | undefined {
  try {
    // Create a partial schema for the specific field
    const fieldSchema = (schema as z.ZodObject<z.ZodRawShape>).pick({
      [fieldName]: true,
    } as Record<string, true>)
    fieldSchema.parse({ [fieldName]: values[fieldName] })
    return undefined
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldError = error.issues.find((issue) =>
        issue.path.includes(fieldName as string),
      )
      return fieldError?.message
    }
    return 'Validation failed'
  }
}

/**
 * Safe validation that returns both success status and errors
 */
export function validateData<T>(
  schema: ZodSchema<T>,
  values: T,
): { success: boolean; errors: Record<string, string>; data?: T } {
  try {
    const data = schema.parse(values)
    return { success: true, errors: {}, data }
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, errors: formatZodErrors(error) }
    }
    return { success: false, errors: { general: 'Validation failed' } }
  }
}

/**
 * Custom validation rules for specific business logic
 */
export const CustomValidationRules = {
  /**
   * Validate that the expense date is not in the future
   */
  expenseDateNotFuture: (date: string): string | undefined => {
    const expenseDate = new Date(date)
    const today = new Date()
    today.setHours(23, 59, 59, 999) // End of today

    if (expenseDate > today) {
      return 'Expense date cannot be in the future'
    }
    return undefined
  },

  /**
   * Validate that the expense date is not too old (e.g., more than 2 years)
   */
  expenseDateNotTooOld: (date: string): string | undefined => {
    const expenseDate = new Date(date)
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

    if (expenseDate < twoYearsAgo) {
      return 'Expense date cannot be more than 2 years old'
    }
    return undefined
  },

  /**
   * Validate reasonable expense amounts based on category
   */
  reasonableExpenseAmount: (
    amount: number,
    category: string,
  ): string | undefined => {
    const limits = {
      accommodation: 5000,
      transportation: 10000,
      meals: 1000,
      visa: 2000,
      other: 3000,
    }

    const limit = limits[category as keyof typeof limits] || 1000

    if (amount > limit) {
      return `Amount seems high for ${category}. Please ensure this is correct.`
    }
    return undefined
  },
}

/**
 * Validate expense with custom business rules
 */
export function validateExpenseWithBusinessRules(
  values: Partial<TravelExpenseInput>,
): Record<string, string> {
  // Start with schema validation
  const schemaErrors = validateExpenseForm(values)

  // Add custom business rule validations
  const customErrors: Record<string, string> = {}

  if (values.expenseDate) {
    const futureDateError = CustomValidationRules.expenseDateNotFuture(
      values.expenseDate,
    )
    if (futureDateError) {
      customErrors.expenseDate = futureDateError
    }

    const oldDateError = CustomValidationRules.expenseDateNotTooOld(
      values.expenseDate,
    )
    if (oldDateError && !customErrors.expenseDate) {
      customErrors.expenseDate = oldDateError
    }
  }

  if (values.amount && values.category) {
    const amountError = CustomValidationRules.reasonableExpenseAmount(
      values.amount,
      values.category,
    )
    if (amountError) {
      customErrors.amount = amountError
    }
  }

  return { ...schemaErrors, ...customErrors }
}
