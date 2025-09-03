export enum TravelSupportStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  PAID = 'paid',
  REJECTED = 'rejected',
}

export enum ExpenseCategory {
  ACCOMMODATION = 'accommodation',
  TRANSPORTATION = 'transportation',
  MEALS = 'meals',
  VISA = 'visa',
  OTHER = 'other',
}

export enum ExpenseStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export const SUPPORTED_CURRENCIES = [
  'NOK',
  'USD',
  'EUR',
  'GBP',
  'SEK',
  'DKK',
  'OTHER',
] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export interface BankingDetails {
  beneficiaryName: string
  bankName: string
  iban?: string
  accountNumber?: string
  swiftCode: string
  country: string
  preferredCurrency: SupportedCurrency
}

export interface ExpenseReceipt {
  file: {
    _type: 'file'
    asset: {
      _ref: string
      _type: 'reference'
    }
  }
  filename: string
  uploadedAt: string
}

export interface TravelExpenseInput {
  category: ExpenseCategory
  description: string
  amount: number
  currency: SupportedCurrency
  customCurrency?: string
  expenseDate: string
  location?: string
  receipts: ExpenseReceipt[]
}

export interface TravelExpense extends TravelExpenseInput {
  _id: string
  _rev: string
  _createdAt: string
  _updatedAt: string
  travelSupport: {
    _ref: string
    _type: 'reference'
  }
  status: ExpenseStatus
  reviewNotes?: string
}

export interface TravelSupportInput {
  speaker: {
    _ref: string
    _type: 'reference'
  }
  conference: {
    _ref: string
    _type: 'reference'
  }
  bankingDetails: BankingDetails
}

export interface TravelSupport extends TravelSupportInput {
  _id: string
  _rev: string
  _createdAt: string
  _updatedAt: string
  status: TravelSupportStatus
  totalAmount?: number
  approvedAmount?: number
  submittedAt?: string
  reviewedAt?: string
  reviewedBy?: {
    _ref: string
    _type: 'reference'
  }
  reviewNotes?: string
}

export interface TravelSupportWithExpenses extends TravelSupport {
  expenses: TravelExpense[]
}

export interface TravelSupportWithSpeaker
  extends Omit<TravelSupport, 'speaker' | 'conference'> {
  speaker: {
    _id: string
    name: string
    email: string
  }
  conference: {
    _id: string
    name: string
  }
}

export interface TravelSupportSummary {
  totalRequests: number
  pendingReview: number
  approved: number
  paid: number
  totalApprovedAmount: number
}
