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
import {
  getOrganizationRefViaParentConference,
  organizationField,
} from '@/lib/organization/sanity'
import { scopedFetch } from '@/lib/sanity/scoped'

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
    (TravelSupportWithSpeaker & { expenses: TravelExpense[] }) | null
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
        "conferenceOrgId": conference->organization._ref,
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

/**
 * Every travel-support submission for ONE conference.
 *
 * TENANCY — FAILS CLOSED. `travelSupport` carries the speaker's BANKING DETAILS
 * (see {@link BankingDetails}). This used to take an OPTIONAL `conferenceId` and
 * degrade to `*[_type == "travelSupport"]` when it was falsy, so a single
 * argument-less call would have returned every tenant's speakers' bank account
 * numbers. The predicate is now unconditional: `conferenceId` is required, and
 * an unresolvable tenant returns EMPTY without issuing any query at all.
 */
export async function getAllTravelSupport(conferenceId: string): Promise<{
  travelSupports: (TravelSupportWithSpeaker & { expenses?: TravelExpense[] })[]
  error: Error | null
}> {
  if (!conferenceId) {
    return {
      travelSupports: [],
      error: new Error(
        'getAllTravelSupport: refusing to read travel support (banking details) without a resolved conference',
      ),
    }
  }

  try {
    const travelSupports = await scopedFetch<
      (TravelSupportWithSpeaker & { expenses?: TravelExpense[] })[]
    >(
      clientRead,
      { conferenceId },
      `*[_type == "travelSupport"] | order(_createdAt desc) {
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
  if (!conferenceId) {
    return {
      speakers: [],
      error: new Error(
        'getSpeakersRequiringTravelSupport: refusing to run without a resolved conference',
      ),
    }
  }

  try {
    // TENANCY: driven from the CONFERENCE'S confirmed talks, not from a global
    // speaker sweep. The previous shape rooted at
    // `*[_type == "speaker" && "requires-funding" in flags]` — every tenant's
    // funding-flagged speakers — and relied on a JS filter to drop the ones
    // whose (conference-scoped) nested talk list came back empty. No PII crossed,
    // but it over-read every tenant. Rooting at `talk` makes the tenant
    // predicate the ROOT filter, so nothing outside this conference is read.
    const confirmedTalks = await scopedFetch<
      Array<{
        _id: string
        title: string
        speakers: Array<{
          _id: string
          name: string
          email: string
          flags?: string[]
        }> | null
      }>
    >(
      clientRead,
      { conferenceId },
      `*[_type == "talk" && status == "confirmed"] {
        _id,
        title,
        "speakers": speakers[]-> { _id, name, email, flags }
      }`,
    )

    // Regroup by speaker, keeping only those flagged as requiring funding.
    const bySpeaker = new Map<
      string,
      {
        _id: string
        name: string
        email: string
        confirmedTalks: Array<{ _id: string; title: string }>
      }
    >()
    for (const talk of confirmedTalks) {
      for (const speaker of talk.speakers ?? []) {
        if (!speaker?._id) continue
        if (!speaker.flags?.includes('requires-funding')) continue
        const entry = bySpeaker.get(speaker._id) ?? {
          _id: speaker._id,
          name: speaker.name,
          email: speaker.email,
          confirmedTalks: [],
        }
        entry.confirmedTalks.push({ _id: talk._id, title: talk.title })
        bySpeaker.set(speaker._id, entry)
      }
    }
    const speakersWithConfirmedTalks = [...bySpeaker.values()]

    // Get all travel support submissions for this conference (excluding drafts)
    const existingSubmissions = await scopedFetch<Array<{ speakerId: string }>>(
      clientRead,
      { conferenceId },
      `*[_type == "travelSupport" && status != "draft"] {
        "speakerId": speaker._ref
      }`,
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
    // DENORMALIZED tenant key (CaaS T1-1): copy the organization down from the
    // parent travel support request's conference. Best-effort: absent before 044.
    const orgRef = await getOrganizationRefViaParentConference(travelSupportId)
    const newExpense = await clientWrite.create({
      _type: 'travelExpense',
      ...expense,
      travelSupport: {
        _type: 'reference',
        _ref: travelSupportId,
      },
      status: ExpenseStatus.PENDING,
      ...organizationField(orgRef),
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

export async function getTravelExpenseById(
  expenseId: string,
): Promise<TravelExpense | null> {
  return clientRead.fetch<TravelExpense | null>(
    `*[_type == "travelExpense" && _id == $expenseId][0] {
      ...,
      travelSupport
    }`,
    { expenseId },
  )
}

export async function getTravelExpenseRef(
  expenseId: string,
): Promise<{ travelSupport: { _ref: string } } | null> {
  return clientRead.fetch<{ travelSupport: { _ref: string } } | null>(
    `*[_type == "travelExpense" && _id == $expenseId][0] { travelSupport }`,
    { expenseId },
  )
}

export async function deleteTravelExpense(
  expenseId: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const expense = await getTravelExpenseRef(expenseId)

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
