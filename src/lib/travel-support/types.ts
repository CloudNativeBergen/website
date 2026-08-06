import { CURRENCY_VALUES } from '../../../sanity/schemaTypes/constants'

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

export const SUPPORTED_CURRENCIES = CURRENCY_VALUES

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
  url?: string
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
  expectedPaymentDate?: string
  paidAt?: string
}

export interface TravelSupportWithExpenses extends TravelSupport {
  expenses: TravelExpense[]
}

export interface TravelSupportWithSpeaker extends Omit<
  TravelSupport,
  'speaker' | 'conference'
> {
  speaker: {
    _id: string
    name: string
    email: string
  }
  conference: {
    _id: string
    name: string
  }
  /**
   * The org that owns this request's conference (projected from
   * `conference->organization`). The tenant key the org-scoped organizer authz
   * gates on (B3, #642). Null for a pre-044-backfill conference → organizer
   * access denied (fail closed).
   */
  conferenceOrgId?: string | null
}

/**
 * What the BY-ID read (`getTravelSupportById`) returns — and therefore what
 * `travelSupport.admin.getById` puts on the wire.
 *
 * IT IS DELIBERATELY NARROWER THAN {@link TravelSupportWithSpeaker} (#863). That
 * query used a bare `...` spread over a document whose `bankingDetails` holds
 * IBAN, account number and SWIFT, so it shipped every field the schema has —
 * present and future — to whoever asked. This type is the PROJECTION CONTRACT:
 * the query lists exactly these fields and nothing else, so a field added to
 * `sanity/schemaTypes/travelSupport.ts` tomorrow does not silently join the
 * payload. Its members are the union of what the consumers actually read —
 * `TravelSupportAdminPage`'s detail pane, the ownership check in
 * {@link ../auth}, and the status/expense notification emitters.
 *
 * `bankingDetails` STAYS. It is not residue: the detail pane renders
 * beneficiary, bank, IBAN/account, SWIFT and country so an organizer can pay the
 * speaker. The fix for that exposure is the ownership guard, not the projection.
 *
 * ADD A FIELD HERE ONLY TOGETHER WITH THE QUERY. TypeScript cannot tell a field
 * the query forgot from one the document lacks — both arrive `undefined` — so
 * the two must be edited as one unit.
 */
export interface TravelSupportDetail {
  _id: string
  status: TravelSupportStatus
  bankingDetails: BankingDetails
  totalAmount?: number
  approvedAmount?: number
  expectedPaymentDate?: string
  reviewNotes?: string
  speaker: {
    _id: string
    name: string
    email: string
  }
  conference: {
    _id: string
    name: string
  }
  /** See {@link TravelSupportWithSpeaker.conferenceOrgId} — the tenant key. */
  conferenceOrgId?: string | null
  expenses: TravelExpense[]
}
