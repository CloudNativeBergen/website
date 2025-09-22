import {
  TravelExpense,
  TravelSupportWithExpenses,
  SupportedCurrency,
  ExpenseCategory,
  TravelSupportStatus,
} from './types'

export class TravelSupportService {
  static canEdit(travelSupport: TravelSupportWithExpenses): boolean {
    return travelSupport.status === TravelSupportStatus.DRAFT
  }

  static canSubmit(travelSupport: TravelSupportWithExpenses): boolean {
    return (
      this.canEdit(travelSupport) &&
      this.hasBankingDetails(travelSupport) &&
      this.hasExpenses(travelSupport)
    )
  }

  static hasBankingDetails(travelSupport: TravelSupportWithExpenses): boolean {
    const { bankingDetails } = travelSupport
    return Boolean(
      bankingDetails.beneficiaryName &&
        bankingDetails.bankName &&
        bankingDetails.swiftCode &&
        bankingDetails.country &&
        (bankingDetails.iban || bankingDetails.accountNumber),
    )
  }

  static hasExpenses(travelSupport: TravelSupportWithExpenses): boolean {
    return travelSupport.expenses && travelSupport.expenses.length > 0
  }

  static calculateTotalByCurrency(
    expenses: TravelExpense[],
    currency: SupportedCurrency,
  ): number {
    return expenses
      .filter((expense) => expense.currency === currency)
      .reduce((total, expense) => total + expense.amount, 0)
  }

  static getUsedCurrencies(expenses: TravelExpense[]): SupportedCurrency[] {
    const currencies = new Set<SupportedCurrency>()

    expenses.forEach((expense) => {
      if (expense.currency === 'OTHER' && expense.customCurrency) {
        currencies.add('OTHER')
      } else {
        currencies.add(expense.currency)
      }
    })

    return Array.from(currencies)
  }

  static groupExpensesByCategory(
    expenses: TravelExpense[],
  ): Record<ExpenseCategory, TravelExpense[]> {
    const groups = {
      [ExpenseCategory.ACCOMMODATION]: [],
      [ExpenseCategory.TRANSPORTATION]: [],
      [ExpenseCategory.MEALS]: [],
      [ExpenseCategory.VISA]: [],
      [ExpenseCategory.OTHER]: [],
    } as Record<ExpenseCategory, TravelExpense[]>

    expenses.forEach((expense) => {
      groups[expense.category].push(expense)
    })

    return groups
  }

  static getExpenseSummary(expenses: TravelExpense[]) {
    const currencies = this.getUsedCurrencies(expenses)
    const totalsByCategory = Object.values(ExpenseCategory).map((category) => ({
      category,
      expenses: expenses.filter((expense) => expense.category === category),
      count: expenses.filter((expense) => expense.category === category).length,
    }))

    const totalsByCurrency = currencies.map((currency) => ({
      currency,
      total: this.calculateTotalByCurrency(expenses, currency),
      count: expenses.filter((expense) => expense.currency === currency).length,
    }))

    return {
      totalExpenses: expenses.length,
      totalCategories: totalsByCategory.filter((item) => item.count > 0).length,
      currencies: currencies.length,
      categoryBreakdown: totalsByCategory,
      currencyBreakdown: totalsByCurrency,
      receiptCount: expenses.reduce(
        (total, expense) => total + (expense.receipts?.length || 0),
        0,
      ),
    }
  }

  static validateExpenseBusiness(expense: TravelExpense): string[] {
    const errors: string[] = []

    const expenseDate = new Date(expense.expenseDate)
    const now = new Date()
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(now.getFullYear() - 2)

    if (expenseDate > now) {
      errors.push('Expense date cannot be in the future')
    }

    if (expenseDate < twoYearsAgo) {
      errors.push('Expense date cannot be more than 2 years old')
    }

    const reasonableAmounts = {
      [ExpenseCategory.ACCOMMODATION]: 5000,
      [ExpenseCategory.TRANSPORTATION]: 10000,
      [ExpenseCategory.MEALS]: 1000,
      [ExpenseCategory.VISA]: 2000,
      [ExpenseCategory.OTHER]: 3000,
    }

    const limit = reasonableAmounts[expense.category]
    if (expense.amount > limit) {
      errors.push(
        `Amount ${expense.amount} seems high for ${expense.category} (limit: ${limit})`,
      )
    }

    if (!expense.receipts || expense.receipts.length === 0) {
      errors.push('At least one receipt is required')
    }

    return errors
  }

  static getCategoryDisplayName(category: ExpenseCategory): string {
    const names = {
      [ExpenseCategory.ACCOMMODATION]: 'Accommodation',
      [ExpenseCategory.TRANSPORTATION]: 'Transportation',
      [ExpenseCategory.MEALS]: 'Meals',
      [ExpenseCategory.VISA]: 'Visa/Immigration',
      [ExpenseCategory.OTHER]: 'Other',
    }
    return names[category]
  }

  static getStatusDisplayName(status: TravelSupportStatus): string {
    const names = {
      [TravelSupportStatus.DRAFT]: 'Draft',
      [TravelSupportStatus.SUBMITTED]: 'Submitted',
      [TravelSupportStatus.APPROVED]: 'Approved',
      [TravelSupportStatus.PAID]: 'Paid',
      [TravelSupportStatus.REJECTED]: 'Rejected',
    }
    return names[status]
  }

  static getStatusColor(status: TravelSupportStatus): string {
    const colors = {
      [TravelSupportStatus.DRAFT]: 'gray',
      [TravelSupportStatus.SUBMITTED]: 'blue',
      [TravelSupportStatus.APPROVED]: 'green',
      [TravelSupportStatus.PAID]: 'purple',
      [TravelSupportStatus.REJECTED]: 'red',
    }
    return colors[status]
  }

  static statusAllows(
    status: TravelSupportStatus,
    action: 'edit' | 'submit' | 'approve' | 'pay' | 'reject',
  ): boolean {
    const permissions: Record<TravelSupportStatus, string[]> = {
      [TravelSupportStatus.DRAFT]: ['edit', 'submit'],
      [TravelSupportStatus.SUBMITTED]: ['approve', 'reject'],
      [TravelSupportStatus.APPROVED]: ['pay', 'reject'],
      [TravelSupportStatus.PAID]: [],
      [TravelSupportStatus.REJECTED]: ['approve'],
    }

    return permissions[status].includes(action)
  }

  static canUserApprove(
    isAdmin: boolean,
    requestOwnerId: string,
    approverUserId: string,
  ): boolean {
    if (!isAdmin) {
      return false
    }

    return requestOwnerId !== approverUserId
  }

  static formatCurrency(
    amount: number,
    currency: SupportedCurrency,
    customCurrency?: string,
  ): string {
    const displayCurrency = currency === 'OTHER' ? customCurrency : currency

    if (currency === 'OTHER' && customCurrency) {
      return `${amount.toFixed(2)} ${customCurrency}`
    }

    const supportedIntlCurrencies = ['NOK', 'USD', 'EUR', 'GBP', 'SEK', 'DKK']

    if (supportedIntlCurrencies.includes(displayCurrency || '')) {
      try {
        const formatter = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: displayCurrency,
          minimumFractionDigits: 2,
        })
        return formatter.format(amount)
      } catch {
        return `${amount.toFixed(2)} ${displayCurrency}`
      }
    }

    return `${amount.toFixed(2)} ${displayCurrency || 'USD'}`
  }

  static sortExpensesByDate(expenses: TravelExpense[]): TravelExpense[] {
    return [...expenses].sort(
      (a, b) =>
        new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime(),
    )
  }

  static sortExpensesByAmount(expenses: TravelExpense[]): TravelExpense[] {
    return [...expenses].sort((a, b) => b.amount - a.amount)
  }

  static filterExpensesByDateRange(
    expenses: TravelExpense[],
    startDate: Date,
    endDate: Date,
  ): TravelExpense[] {
    return expenses.filter((expense) => {
      const expenseDate = new Date(expense.expenseDate)
      return expenseDate >= startDate && expenseDate <= endDate
    })
  }

  static getExpenseWarnings(expense: TravelExpense): string[] {
    const warnings: string[] = []

    if (expense.amount % 1 === 0 && expense.amount > 100) {
      warnings.push('Round amounts might need additional documentation')
    }

    const expenseDate = new Date(expense.expenseDate)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    if (expenseDate < thirtyDaysAgo) {
      warnings.push('This is an older expense - ensure receipt is clear')
    }

    return warnings
  }
}
