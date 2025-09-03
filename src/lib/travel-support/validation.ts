import { z } from 'zod'
import {
  TravelSupportStatus,
  ExpenseCategory,
  ExpenseStatus,
  SUPPORTED_CURRENCIES,
} from './types'

// Banking details validation
export const BankingDetailsSchema = z
  .object({
    beneficiaryName: z.string().min(1, 'Beneficiary name is required').max(100),
    bankName: z.string().min(1, 'Bank name is required').max(100),
    iban: z.string().optional(),
    accountNumber: z.string().optional(),
    swiftCode: z
      .string()
      .min(8, 'SWIFT code must be at least 8 characters')
      .max(11),
    country: z.string().min(1, 'Country is required').max(50),
    preferredCurrency: z.enum(SUPPORTED_CURRENCIES),
  })
  .refine((data) => data.iban || data.accountNumber, {
    message: 'Either IBAN or Account Number is required',
    path: ['iban'],
  })

// Optional banking details for initial creation (can be empty)
export const OptionalBankingDetailsSchema = z.object({
  beneficiaryName: z.string().max(100).optional().default(''),
  bankName: z.string().max(100).optional().default(''),
  iban: z.string().optional(),
  accountNumber: z.string().optional(),
  swiftCode: z.string().max(11).optional().default(''),
  country: z.string().max(50).optional().default(''),
  preferredCurrency: z.enum(SUPPORTED_CURRENCIES).default('NOK'),
})

// Receipt validation
export const ExpenseReceiptSchema = z.object({
  file: z.object({
    _type: z.literal('file'),
    asset: z.object({
      _ref: z.string(),
      _type: z.literal('reference'),
    }),
  }),
  filename: z.string(),
  uploadedAt: z.string(),
})

// Travel expense validation
export const TravelExpenseInputSchema = z
  .object({
    category: z.nativeEnum(ExpenseCategory),
    description: z.string().min(1, 'Description is required').max(500),
    amount: z.number().min(0.01, 'Amount must be greater than 0'),
    currency: z.enum(SUPPORTED_CURRENCIES),
    customCurrency: z
      .string()
      .refine(
        (val) => !val || /^[A-Z]{3}$/.test(val),
        'Currency code must be 3 uppercase letters',
      )
      .optional(),
    expenseDate: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), 'Invalid date'),
    location: z.string().max(100).optional(),
    receipts: z
      .array(ExpenseReceiptSchema)
      .min(1, 'At least one receipt is required'),
  })
  .refine(
    (data) => {
      if (data.currency === 'OTHER') {
        return !!data.customCurrency
      }
      return true
    },
    {
      message: 'Custom currency code is required when "OTHER" is selected',
      path: ['customCurrency'],
    },
  )

// Travel support validation
export const TravelSupportInputSchema = z.object({
  speaker: z.object({
    _ref: z.string(),
    _type: z.literal('reference'),
  }),
  conference: z.object({
    _ref: z.string(),
    _type: z.literal('reference'),
  }),
  bankingDetails: BankingDetailsSchema,
})

// Client input schema (without conference - resolved server-side)
export const TravelSupportClientInputSchema = z.object({
  speaker: z.object({
    _ref: z.string(),
    _type: z.literal('reference'),
  }),
  bankingDetails: OptionalBankingDetailsSchema,
})

// Update banking details schema
export const UpdateBankingDetailsSchema = z.object({
  travelSupportId: z.string(),
  bankingDetails: BankingDetailsSchema,
})

// Add expense schema
export const AddExpenseSchema = z.object({
  travelSupportId: z.string(),
  expense: TravelExpenseInputSchema,
})

// Update expense schema (for speakers to edit their expenses)
export const UpdateExpenseSchema = z.object({
  expenseId: z.string(),
  expense: TravelExpenseInputSchema,
})

// Delete expense schema
export const DeleteExpenseSchema = z.object({
  expenseId: z.string(),
})

// Delete receipt schema
export const DeleteReceiptSchema = z.object({
  expenseId: z.string(),
  receiptIndex: z.number().min(0),
})

// Update expense status schema
export const UpdateExpenseStatusSchema = z.object({
  expenseId: z.string(),
  status: z.nativeEnum(ExpenseStatus),
  reviewNotes: z.string().optional(),
})

// Update travel support status schema
export const UpdateTravelSupportStatusSchema = z.object({
  travelSupportId: z.string(),
  status: z.nativeEnum(TravelSupportStatus),
  approvedAmount: z.number().min(0).optional(),
  reviewNotes: z.string().optional(),
})

// Submit travel support schema
export const SubmitTravelSupportSchema = z.object({
  travelSupportId: z.string(),
})

// Query schemas
export const GetTravelSupportSchema = z.object({
  speakerId: z.string().optional(),
  conferenceId: z.string().optional(),
  status: z.nativeEnum(TravelSupportStatus).optional(),
})

export const GetTravelSupportByIdSchema = z.object({
  id: z.string(),
})

// File upload schema
export const UploadReceiptSchema = z.object({
  file: z.instanceof(File),
  filename: z.string(),
})

// Types for TypeScript inference
export type BankingDetailsInput = z.infer<typeof BankingDetailsSchema>
export type TravelExpenseInputType = z.infer<typeof TravelExpenseInputSchema>
export type TravelSupportInputType = z.infer<typeof TravelSupportInputSchema>
export type UpdateBankingDetailsInput = z.infer<
  typeof UpdateBankingDetailsSchema
>
export type AddExpenseInput = z.infer<typeof AddExpenseSchema>
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>
export type DeleteExpenseInput = z.infer<typeof DeleteExpenseSchema>
export type DeleteReceiptInput = z.infer<typeof DeleteReceiptSchema>
export type UpdateExpenseStatusInput = z.infer<typeof UpdateExpenseStatusSchema>
export type UpdateTravelSupportStatusInput = z.infer<
  typeof UpdateTravelSupportStatusSchema
>
export type SubmitTravelSupportInput = z.infer<typeof SubmitTravelSupportSchema>
export type GetTravelSupportInput = z.infer<typeof GetTravelSupportSchema>
export type GetTravelSupportByIdInput = z.infer<
  typeof GetTravelSupportByIdSchema
>
export type UploadReceiptInput = z.infer<typeof UploadReceiptSchema>
