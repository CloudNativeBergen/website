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
        "expenses": *[_type == "travelExpense" && travelSupport._ref == ^._id] | order(_createdAt desc) {
          ...,
          receipts[] {
            ...,
            "url": file.asset->url
          }
        }
      }`,
        { speakerId, conferenceId },
      )

    return { travelSupport, error: null }
  } catch (error) {
    return { travelSupport: null, error: error as Error }
  }
}

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
        "expenses": *[_type == "travelExpense" && travelSupport._ref == ^._id] | order(_createdAt desc) {
          ...,
          receipts[] {
            ...,
            "url": file.asset->url
          }
        }
      }`,
      { id },
    )

    return { travelSupport, error: null }
  } catch (error) {
    return { travelSupport: null, error: error as Error }
  }
}

export async function getAllTravelSupport(conferenceId?: string): Promise<{
  travelSupports: (TravelSupportWithSpeaker & { expenses?: TravelExpense[] })[]
  error: Error | null
}> {
  try {
    const query = conferenceId
      ? `*[_type == "travelSupport" && conference._ref == $conferenceId] | order(_createdAt desc)`
      : `*[_type == "travelSupport"] | order(_createdAt desc)`

    const travelSupports = await clientRead.fetch<
      (TravelSupportWithSpeaker & { expenses?: TravelExpense[] })[]
    >(
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
        },
        "expenses": *[_type == "travelExpense" && travelSupport._ref == ^._id] {
          ...,
          receipts[] {
            ...,
            "url": file.asset->url
          }
        }
      }`,
      conferenceId ? { conferenceId } : {},
    )

    return { travelSupports, error: null }
  } catch (error) {
    return { travelSupports: [], error: error as Error }
  }
}

export async function getSpeakersRequiringTravelSupport(
  conferenceId: string,
): Promise<{
  speakers: Array<{
    _id: string
    name: string
    email: string
    hasSubmitted: boolean
    confirmedTalks: Array<{ _id: string; title: string }>
  }>
  error: Error | null
}> {
  try {
    // Get all speakers with confirmed talks who require travel funding
    const allSpeakers = await clientRead.fetch<
      Array<{
        _id: string
        name: string
        email: string
        confirmedTalks: Array<{ _id: string; title: string }>
      }>
    >(
      `*[_type == "speaker" && "requires-funding" in flags] {
        _id,
        name,
        email,
        "confirmedTalks": *[
          _type == "talk"
          && status == "confirmed"
          && conference._ref == $conferenceId
          && references(^._id)
        ] {
          _id,
          title
        }
      }`,
      { conferenceId },
    )

    // Filter to only speakers with confirmed talks
    const speakersWithConfirmedTalks = allSpeakers.filter(
      (s) => s.confirmedTalks && s.confirmedTalks.length > 0,
    )

    // Get all travel support submissions for this conference (excluding drafts)
    const existingSubmissions = await clientRead.fetch<
      Array<{ speakerId: string }>
    >(
      `*[_type == "travelSupport" && conference._ref == $conferenceId && status != "draft"] {
        "speakerId": speaker._ref
      }`,
      { conferenceId },
    )

    const submittedSpeakerIds = new Set(
      existingSubmissions.map((s) => s.speakerId),
    )

    // Mark which speakers have submitted
    const speakers = speakersWithConfirmedTalks.map((speaker) => ({
      ...speaker,
      hasSubmitted: submittedSpeakerIds.has(speaker._id),
    }))

    return { speakers, error: null }
  } catch (error) {
    return { speakers: [], error: error as Error }
  }
}

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

export async function updateTravelSupportStatus(
  travelSupportId: string,
  status: TravelSupportStatus,
  reviewedBy: string,
  approvedAmount?: number,
  reviewNotes?: string,
  expectedPaymentDate?: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const updateData: {
      status: TravelSupportStatus
      reviewedAt: string
      reviewedBy: { _type: 'reference'; _ref: string }
      approvedAmount?: number
      reviewNotes?: string
      expectedPaymentDate?: string
      paidAt?: string
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

    if (expectedPaymentDate) {
      updateData.expectedPaymentDate = expectedPaymentDate
    }

    if (status === TravelSupportStatus.PAID) {
      updateData.paidAt = new Date().toISOString()
    }

    await clientWrite.patch(travelSupportId).set(updateData).commit()

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

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

    await updateTravelSupportTotal(travelSupportId)

    return { expense: newExpense as TravelExpense, error: null }
  } catch (error) {
    return { expense: null, error: error as Error }
  }
}

export async function updateTravelExpense(
  expenseId: string,
  expense: TravelExpenseInput,
): Promise<{ expense: TravelExpense | null; error: Error | null }> {
  try {
    const existingExpense = await clientRead.fetch<TravelExpense>(
      `*[_type == "travelExpense" && _id == $expenseId][0]`,
      { expenseId },
    )

    if (!existingExpense) {
      return { expense: null, error: new Error('Expense not found') }
    }

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

    const travelSupportId = existingExpense.travelSupport._ref
    await updateTravelSupportTotal(travelSupportId)

    return { expense: updatedExpense as unknown as TravelExpense, error: null }
  } catch (error) {
    return { expense: null, error: error as Error }
  }
}

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

export async function deleteTravelExpense(
  expenseId: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const expense = await clientRead.fetch<{ travelSupport: { _ref: string } }>(
      `*[_type == "travelExpense" && _id == $expenseId][0] { travelSupport }`,
      { expenseId },
    )

    await clientWrite.delete(expenseId)

    if (expense?.travelSupport?._ref) {
      await updateTravelSupportTotal(expense.travelSupport._ref)
    }

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

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

async function updateTravelSupportTotal(
  travelSupportId: string,
): Promise<void> {
  const expenses = await clientRead.fetch<
    { amount: number; status: string; currency: string }[]
  >(
    `*[_type == "travelExpense" && travelSupport._ref == $travelSupportId] { amount, status, currency }`,
    { travelSupportId },
  )

  // Sum all expenses (not just approved) to show total requested
  // Note: This doesn't convert currencies - that's handled in the frontend
  const totalAmount = expenses.reduce(
    (sum: number, expense: { amount: number; status: string }) =>
      sum + expense.amount,
    0,
  )

  await clientWrite.patch(travelSupportId).set({ totalAmount }).commit()
}

export async function deleteReceipt(
  expenseId: string,
  receiptIndex: number,
): Promise<{
  success: boolean
  error: Error | null
}> {
  try {
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

    const updatedReceipts = expense.receipts.filter(
      (_, index) => index !== receiptIndex,
    )

    await clientWrite
      .patch(expenseId)
      .set({ receipts: updatedReceipts })
      .commit()

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}
