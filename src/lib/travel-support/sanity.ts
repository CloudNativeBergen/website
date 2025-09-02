import {
  clientReadUncached as clientRead,
  clientWrite,
} from '@/lib/sanity/client'
import {
  TravelSupport,
  TravelSupportInput,
  TravelSupportWithExpenses,
  TravelSupportWithSpeaker,
  TravelExpense,
  TravelExpenseInput,
  BankingDetails,
  TravelSupportStatus,
  ExpenseStatus,
} from './types'

/**
 * Get travel support request by speaker ID and conference ID
 */
export async function getTravelSupport(
  speakerId: string,
  conferenceId: string,
): Promise<{
  travelSupport: TravelSupportWithExpenses | null
  error: Error | null
}> {
  try {
    const travelSupport =
      await clientRead.fetch<TravelSupportWithExpenses | null>(
        `*[_type == "travelSupport" && speaker._ref == $speakerId && conference._ref == $conferenceId][0] {
        ...,
        "expenses": *[_type == "travelExpense" && travelSupport._ref == ^._id] | order(_createdAt desc)
      }`,
        { speakerId, conferenceId },
      )

    return { travelSupport, error: null }
  } catch (error) {
    return { travelSupport: null, error: error as Error }
  }
}

/**
 * Get travel support request by ID
 */
export async function getTravelSupportById(id: string): Promise<{
  travelSupport:
    | (TravelSupportWithSpeaker & { expenses: TravelExpense[] })
    | null
  error: Error | null
}> {
  try {
    if (!id) {
      throw new Error('Travel support ID is required')
    }

    const travelSupport = await clientRead.fetch<
      (TravelSupportWithSpeaker & { expenses: TravelExpense[] }) | null
    >(
      `*[_type == "travelSupport" && _id == $id][0] {
        ...,
        speaker-> {
          _id,
          name,
          email
        },
        conference-> {
          _id,
          name
        },
        "expenses": *[_type == "travelExpense" && travelSupport._ref == ^._id] | order(_createdAt desc)
      }`,
      { id },
    )

    return { travelSupport, error: null }
  } catch (error) {
    return { travelSupport: null, error: error as Error }
  }
}

/**
 * Get all travel support requests for admin
 */
export async function getAllTravelSupport(conferenceId?: string): Promise<{
  travelSupports: TravelSupportWithSpeaker[]
  error: Error | null
}> {
  try {
    const query = conferenceId
      ? `*[_type == "travelSupport" && conference._ref == $conferenceId] | order(_createdAt desc)`
      : `*[_type == "travelSupport"] | order(_createdAt desc)`

    const travelSupports = await clientRead.fetch<TravelSupportWithSpeaker[]>(
      `${query} {
        ...,
        speaker-> {
          _id,
          name,
          email
        },
        conference-> {
          _id,
          name
        }
      }`,
      conferenceId ? { conferenceId } : {},
    )

    return { travelSupports, error: null }
  } catch (error) {
    return { travelSupports: [], error: error as Error }
  }
}

/**
 * Create travel support request
 */
export async function createTravelSupport(
  data: TravelSupportInput,
): Promise<{ travelSupport: TravelSupport | null; error: Error | null }> {
  try {
    const travelSupport = await clientWrite.create({
      _type: 'travelSupport',
      ...data,
      status: TravelSupportStatus.DRAFT,
      totalAmount: 0,
    })

    return { travelSupport: travelSupport as TravelSupport, error: null }
  } catch (error) {
    return { travelSupport: null, error: error as Error }
  }
}

/**
 * Update banking details
 */
export async function updateBankingDetails(
  travelSupportId: string,
  bankingDetails: BankingDetails,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    await clientWrite.patch(travelSupportId).set({ bankingDetails }).commit()

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

/**
 * Submit travel support for review
 */
export async function submitTravelSupport(
  travelSupportId: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    await clientWrite
      .patch(travelSupportId)
      .set({
        status: TravelSupportStatus.SUBMITTED,
        submittedAt: new Date().toISOString(),
      })
      .commit()

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

/**
 * Update travel support status (admin)
 */
export async function updateTravelSupportStatus(
  travelSupportId: string,
  status: TravelSupportStatus,
  reviewedBy: string,
  approvedAmount?: number,
  reviewNotes?: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const updateData: {
      status: TravelSupportStatus
      reviewedAt: string
      reviewedBy: { _type: 'reference'; _ref: string }
      approvedAmount?: number
      reviewNotes?: string
    } = {
      status,
      reviewedAt: new Date().toISOString(),
      reviewedBy: {
        _type: 'reference',
        _ref: reviewedBy,
      },
    }

    if (approvedAmount !== undefined) {
      updateData.approvedAmount = approvedAmount
    }

    if (reviewNotes) {
      updateData.reviewNotes = reviewNotes
    }

    await clientWrite.patch(travelSupportId).set(updateData).commit()

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

/**
 * Add expense to travel support
 */
export async function addTravelExpense(
  travelSupportId: string,
  expense: TravelExpenseInput,
): Promise<{ expense: TravelExpense | null; error: Error | null }> {
  try {
    const newExpense = await clientWrite.create({
      _type: 'travelExpense',
      ...expense,
      travelSupport: {
        _type: 'reference',
        _ref: travelSupportId,
      },
      status: ExpenseStatus.PENDING,
    })

    // Update total amount on travel support
    await updateTravelSupportTotal(travelSupportId)

    return { expense: newExpense as TravelExpense, error: null }
  } catch (error) {
    return { expense: null, error: error as Error }
  }
}

/**
 * Update expense (for speakers to edit their expenses)
 */
export async function updateTravelExpense(
  expenseId: string,
  expense: TravelExpenseInput,
): Promise<{ expense: TravelExpense | null; error: Error | null }> {
  try {
    // Get the existing expense to check if it can be updated
    const existingExpense = await clientRead.fetch<TravelExpense>(
      `*[_type == "travelExpense" && _id == $expenseId][0]`,
      { expenseId },
    )

    if (!existingExpense) {
      return { expense: null, error: new Error('Expense not found') }
    }

    // Check if expense can be updated (only pending expenses)
    if (existingExpense.status !== ExpenseStatus.PENDING) {
      return {
        expense: null,
        error: new Error('Cannot update expense that has been reviewed'),
      }
    }

    const updatedExpense = await clientWrite
      .patch(expenseId)
      .set(expense)
      .commit()

    // Update total amount on travel support
    const travelSupportId = existingExpense.travelSupport._ref
    await updateTravelSupportTotal(travelSupportId)

    return { expense: updatedExpense as unknown as TravelExpense, error: null }
  } catch (error) {
    return { expense: null, error: error as Error }
  }
}

/**
 * Update expense status (admin)
 */
export async function updateExpenseStatus(
  expenseId: string,
  status: ExpenseStatus,
  reviewNotes?: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const updateData: {
      status: ExpenseStatus
      reviewNotes?: string
    } = { status }
    if (reviewNotes) {
      updateData.reviewNotes = reviewNotes
    }

    await clientWrite.patch(expenseId).set(updateData).commit()

    // Update total amount on related travel support
    const expense = await clientRead.fetch<{ travelSupport: { _ref: string } }>(
      `*[_type == "travelExpense" && _id == $expenseId][0] { travelSupport }`,
      { expenseId },
    )

    if (expense?.travelSupport?._ref) {
      await updateTravelSupportTotal(expense.travelSupport._ref)
    }

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

/**
 * Delete expense
 */
export async function deleteTravelExpense(
  expenseId: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    // Get travel support reference before deleting
    const expense = await clientRead.fetch<{ travelSupport: { _ref: string } }>(
      `*[_type == "travelExpense" && _id == $expenseId][0] { travelSupport }`,
      { expenseId },
    )

    await clientWrite.delete(expenseId)

    // Update total amount on related travel support
    if (expense?.travelSupport?._ref) {
      await updateTravelSupportTotal(expense.travelSupport._ref)
    }

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

/**
 * Upload receipt file
 */
export async function uploadReceiptFile(file: File): Promise<{
  asset: { _id: string; url: string } | null
  error: Error | null
}> {
  try {
    const asset = await clientWrite.assets.upload('file', file, {
      filename: file.name,
    })

    return { asset, error: null }
  } catch (error) {
    return { asset: null, error: error as Error }
  }
}

/**
 * Helper function to update total amount on travel support
 */
async function updateTravelSupportTotal(
  travelSupportId: string,
): Promise<void> {
  const expenses = await clientRead.fetch<{ amount: number; status: string }[]>(
    `*[_type == "travelExpense" && travelSupport._ref == $travelSupportId] { amount, status }`,
    { travelSupportId },
  )

  const totalAmount = expenses
    .filter(
      (expense: { amount: number; status: string }) =>
        expense.status === ExpenseStatus.APPROVED,
    )
    .reduce(
      (sum: number, expense: { amount: number; status: string }) =>
        sum + expense.amount,
      0,
    )

  await clientWrite.patch(travelSupportId).set({ totalAmount }).commit()
}

/**
 * Delete an expense
 */
export async function deleteExpense(expenseId: string): Promise<{
  success: boolean
  error: Error | null
}> {
  try {
    await clientWrite.delete(expenseId)
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

/**
 * Delete a receipt from an expense
 */
export async function deleteReceipt(
  expenseId: string,
  receiptIndex: number,
): Promise<{
  success: boolean
  error: Error | null
}> {
  try {
    // Get the current expense
    const expense = await clientRead.fetch<{ receipts: unknown[] }>(
      `*[_type == "travelExpense" && _id == $expenseId][0] { receipts }`,
      { expenseId },
    )

    if (!expense || !expense.receipts) {
      throw new Error('Expense or receipts not found')
    }

    if (receiptIndex < 0 || receiptIndex >= expense.receipts.length) {
      throw new Error('Invalid receipt index')
    }

    // Remove the receipt at the specified index
    const updatedReceipts = expense.receipts.filter(
      (_, index) => index !== receiptIndex,
    )

    // Update the expense with the new receipts array
    await clientWrite
      .patch(expenseId)
      .set({ receipts: updatedReceipts })
      .commit()

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}
