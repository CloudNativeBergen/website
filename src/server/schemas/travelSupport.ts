import { z } from 'zod'
import {
  BankingDetailsSchema,
  TravelExpenseInputSchema,
  TravelSupportInputSchema,
  TravelSupportClientInputSchema,
  UpdateBankingDetailsSchema,
  AddExpenseSchema,
  UpdateExpenseSchema,
  DeleteExpenseSchema,
  DeleteReceiptSchema,
  UpdateExpenseStatusSchema,
  UpdateTravelSupportStatusSchema,
  SubmitTravelSupportSchema,
  GetTravelSupportSchema,
  GetTravelSupportByIdSchema,
} from '@/lib/travel-support/validation'

export {
  BankingDetailsSchema,
  TravelExpenseInputSchema,
  TravelSupportInputSchema,
  TravelSupportClientInputSchema,
  UpdateBankingDetailsSchema,
  AddExpenseSchema,
  UpdateExpenseSchema,
  DeleteExpenseSchema,
  DeleteReceiptSchema,
  UpdateExpenseStatusSchema,
  UpdateTravelSupportStatusSchema,
  SubmitTravelSupportSchema,
  GetTravelSupportSchema,
  GetTravelSupportByIdSchema,
}

export const IdParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
})

export const FileUploadSchema = z.object({
  expenseId: z.string().min(1, 'Expense ID is required'),
  file: z.instanceof(File, { message: 'File is required' }),
})
