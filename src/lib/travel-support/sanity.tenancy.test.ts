import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * TENANCY REGRESSIONS for the travel-support reads (#616, batch A2).
 *
 * `travelSupport` carries the speaker's BANKING DETAILS. `getAllTravelSupport`
 * used to take an OPTIONAL `conferenceId` and degrade to
 * `*[_type == "travelSupport"]` when it was falsy — every tenant's speakers'
 * bank account numbers. The unknown-host path made that reachable:
 * `getConferenceForCurrentDomain()` returns a truthy `{}` for an unknown host,
 * so the router's `if (!conference)` never fired and `conference._id` was
 * `undefined`.
 *
 * Each test asserts BOTH that the fail-closed path returns nothing AND that it
 * issues no query at all.
 */
const fetchMock = vi.fn()
const patchMock = vi.fn()
const deleteMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: {
    fetch: (...a: unknown[]) => fetchMock(...a),
    patch: (id: string) => {
      patchMock(id)
      return {
        set: (data: unknown) => ({
          commit: async () => ({ _id: id, ...(data as object) }),
        }),
      }
    },
    delete: (...a: unknown[]) => deleteMock(...a),
  },
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefViaParentConference: vi.fn(),
  organizationField: () => ({}),
}))

import { parse, evaluate } from 'groq-js'
import {
  getAllTravelSupport,
  getSpeakersRequiringTravelSupport,
  getTravelSupportById,
  getTravelExpenseRef,
  updateTravelExpense,
  updateExpenseStatus,
  deleteTravelExpense,
  deleteReceipt,
} from './sanity'
import {
  ExpenseCategory,
  ExpenseStatus,
  type TravelExpenseInput,
} from './types'

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue([])
})

describe('getAllTravelSupport — banking PII must never go global', () => {
  it('binds the conference predicate into the read', async () => {
    await getAllTravelSupport('conf-1')

    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('conference._ref == $conferenceId')
    expect(params).toMatchObject({ conferenceId: 'conf-1' })
  })

  it('never emits the unscoped `*[_type == "travelSupport"]` root filter', async () => {
    await getAllTravelSupport('conf-1')

    const [query] = fetchMock.mock.calls[0]
    // The root filter must LEAD with the tenant predicate, not `_type`.
    expect(query).toMatch(/\*\[\s*conference\._ref == \$conferenceId/)
  })

  // MUTATION CHECK (verified): deleting the `if (!conferenceId)` guard does NOT
  // make this fail — `scopedFetch` throws on an empty scope before reaching the
  // client, so the read is closed by TWO independent layers. What DOES fail if
  // the read is reverted to the old `conferenceId ? scoped : global` ternary is
  // `expect(fetchMock).not.toHaveBeenCalled()`, because the global branch issues
  // a real query. That is the regression this pins.
  it('FAILS CLOSED on an unresolvable conference: no query, no records', async () => {
    const { travelSupports, error } = await getAllTravelSupport(
      undefined as unknown as string,
    )

    expect(travelSupports).toEqual([])
    expect(error).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED on an empty-string conference id', async () => {
    const { travelSupports, error } = await getAllTravelSupport('')

    expect(travelSupports).toEqual([])
    expect(error).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getSpeakersRequiringTravelSupport — scoped at the ROOT filter', () => {
  it('roots the read at the conference’s talks, not a global speaker sweep', async () => {
    await getSpeakersRequiringTravelSupport('conf-1')

    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('conference._ref == $conferenceId')
    expect(query).toContain('_type == "talk"')
    // The old shape swept every tenant's funding-flagged speakers.
    expect(query).not.toContain('"requires-funding" in flags')
    expect(params).toMatchObject({ conferenceId: 'conf-1' })
  })

  it('keeps only speakers flagged as requiring funding, grouped by person', async () => {
    fetchMock
      .mockResolvedValueOnce([
        {
          _id: 't1',
          title: 'Talk One',
          speakers: [
            {
              _id: 'spk-1',
              name: 'A',
              email: 'a@x',
              flags: ['requires-funding'],
            },
            { _id: 'spk-2', name: 'B', email: 'b@x', flags: [] },
          ],
        },
        {
          _id: 't2',
          title: 'Talk Two',
          speakers: [
            {
              _id: 'spk-1',
              name: 'A',
              email: 'a@x',
              flags: ['requires-funding'],
            },
          ],
        },
      ])
      .mockResolvedValueOnce([{ speakerId: 'spk-1' }])

    const { speakers, error } =
      await getSpeakersRequiringTravelSupport('conf-1')

    expect(error).toBeNull()
    expect(speakers).toHaveLength(1)
    expect(speakers[0]).toMatchObject({
      _id: 'spk-1',
      hasSubmitted: true,
    })
    expect(speakers[0].confirmedTalks.map((t) => t._id)).toEqual(['t1', 't2'])
  })

  it('FAILS CLOSED on an unresolvable conference: no query, no speakers', async () => {
    const { speakers, error } = await getSpeakersRequiringTravelSupport('')

    expect(speakers).toEqual([])
    expect(error).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/**
 * REQUESTER-SCOPED BY-ID READS, evaluated with the REAL groq engine (S7,
 * platform#53, at the #858 bar).
 *
 * The by-id helpers used to be global reads that trusted every caller to guard
 * them (#863's HIGH was one that did not). The predicate now lives IN the query
 * — owner (`speaker._ref == $requesterId`) ∨ organizer of the document's org
 * (`conference->organization._ref in $orgIds`) — so these cases back the client
 * with `groq-js` over a two-tenant dataset, exactly like
 * `src/server/tenancy.exploits.test.ts`: no branch on the query text, so a
 * predicate that is dropped, reordered into a fail-open disjunct, or reversed
 * fails here on the foreign IBAN coming back or the foreign patch being issued,
 * not on a moved error message.
 */
const ORG_A = 'org-A'
const ORG_B = 'org-B'
const FOREIGN_IBAN = 'NO9386011117947'

const ref = (id: string) => ({ _type: 'reference', _ref: id })

/** Both tenants, in one dataset — the thing an unscoped read cannot tell apart. */
const DATASET = [
  {
    _id: 'conf-A',
    _type: 'conference',
    name: 'Conf A',
    organization: ref(ORG_A),
  },
  {
    _id: 'conf-B',
    _type: 'conference',
    name: 'Conf B',
    organization: ref(ORG_B),
  },
  { _id: 'sp-A', _type: 'speaker', name: 'Ours', email: 'a@x.test' },
  { _id: 'sp-B', _type: 'speaker', name: 'Theirs', email: 'b@x.test' },
  {
    _id: 'ts-A',
    _type: 'travelSupport',
    status: 'draft',
    speaker: ref('sp-A'),
    conference: ref('conf-A'),
    bankingDetails: { iban: 'OUR-IBAN' },
  },
  {
    _id: 'ts-B',
    _type: 'travelSupport',
    status: 'draft',
    speaker: ref('sp-B'),
    conference: ref('conf-B'),
    bankingDetails: { iban: FOREIGN_IBAN },
  },
  {
    _id: 'exp-A',
    _type: 'travelExpense',
    travelSupport: ref('ts-A'),
    amount: 100,
    currency: 'NOK',
    status: 'pending',
    receipts: [{ _key: 'r1' }],
  },
  {
    _id: 'exp-B',
    _type: 'travelExpense',
    travelSupport: ref('ts-B'),
    amount: 999,
    currency: 'NOK',
    status: 'pending',
    receipts: [{ _key: 'r1' }],
  },
]

/** A minimal valid edit for the update cases. */
const EXPENSE_EDIT: TravelExpenseInput = {
  description: 'Train',
  amount: 50,
  currency: 'NOK',
  category: ExpenseCategory.OTHER,
  expenseDate: '2026-06-01',
  receipts: [],
}

/** An organizer of tenant A, and the speaker who owns tenant B's request. */
const ADMIN_A = { _id: 'sp-admin-A', organizerOrgIds: [ORG_A] }
const OWNER_B = { _id: 'sp-B', organizerOrgIds: [] }

/** Back every read with a real GROQ evaluation — nothing can agree with a wrong predicate. */
function useDataset() {
  fetchMock.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset: DATASET, params })).get(),
  )
}

describe('getTravelSupportById — the query refuses a foreign id (S7)', () => {
  beforeEach(useDataset)

  it('returns OUR request in full, its own expenses included', async () => {
    const { travelSupport, error } = await getTravelSupportById('ts-A', ADMIN_A)

    expect(error).toBeNull()
    expect(travelSupport).toMatchObject({
      _id: 'ts-A',
      bankingDetails: { iban: 'OUR-IBAN' },
      conferenceOrgId: ORG_A,
    })
    // The parent-keyed nested read, evaluated for real: only ts-A's expenses.
    expect(travelSupport?.expenses.map((e) => e._id)).toEqual(['exp-A'])
  })

  it('answers a FOREIGN id exactly like a nonexistent one — no banking, no oracle', async () => {
    const foreign = await getTravelSupportById('ts-B', ADMIN_A)
    const missing = await getTravelSupportById('ts-nope', ADMIN_A)

    // Unscoped, `foreign.travelSupport` IS tenant B's document — this line
    // fails printing the IBAN it handed over.
    expect(foreign).toEqual({ travelSupport: null, error: null })
    expect(foreign).toEqual(missing)
    expect(JSON.stringify(foreign)).not.toContain(FOREIGN_IBAN)
  })

  it('still admits the OWNER, who organizes nothing', async () => {
    const { travelSupport } = await getTravelSupportById('ts-B', OWNER_B)

    expect(travelSupport?._id).toBe('ts-B')
  })
})

describe('expense helpers — foreign expenses read as nonexistent and are never written (S7)', () => {
  beforeEach(useDataset)

  it('getTravelExpenseRef resolves ours and refuses theirs identically to missing', async () => {
    expect(await getTravelExpenseRef('exp-A', ADMIN_A)).toMatchObject({
      travelSupport: { _ref: 'ts-A' },
    })
    expect(await getTravelExpenseRef('exp-B', ADMIN_A)).toBeNull()
    expect(await getTravelExpenseRef('exp-nope', ADMIN_A)).toBeNull()
  })

  it('updateTravelExpense patches ours', async () => {
    const { error } = await updateTravelExpense('exp-A', EXPENSE_EDIT, ADMIN_A)

    expect(error).toBeNull()
    expect(patchMock).toHaveBeenCalledWith('exp-A')
  })

  it('updateTravelExpense refuses a foreign expense WITHOUT patching it', async () => {
    const { expense, error } = await updateTravelExpense(
      'exp-B',
      EXPENSE_EDIT,
      ADMIN_A,
    )

    expect(expense).toBeNull()
    expect(error?.message).toBe('Expense not found')
    expect(patchMock).not.toHaveBeenCalled()
  })

  it('updateExpenseStatus refuses a foreign expense BEFORE the patch', async () => {
    const { success } = await updateExpenseStatus(
      'exp-B',
      ExpenseStatus.APPROVED,
      ADMIN_A,
    )

    expect(success).toBe(false)
    expect(patchMock).not.toHaveBeenCalled()

    const ours = await updateExpenseStatus(
      'exp-A',
      ExpenseStatus.APPROVED,
      ADMIN_A,
    )
    expect(ours.success).toBe(true)
    expect(patchMock).toHaveBeenCalledWith('exp-A')
  })

  it('deleteTravelExpense never deletes a foreign expense', async () => {
    const { success, error } = await deleteTravelExpense('exp-B', ADMIN_A)

    // The old shape deleted UNCONDITIONALLY and only used the scoped ref for
    // the total recompute — this pins the fail-closed refusal.
    expect(success).toBe(false)
    expect(error?.message).toBe('Expense not found')
    expect(deleteMock).not.toHaveBeenCalled()

    const ours = await deleteTravelExpense('exp-A', ADMIN_A)
    expect(ours.success).toBe(true)
    expect(deleteMock).toHaveBeenCalledWith('exp-A')
  })

  it('deleteReceipt never touches a foreign expense’s receipts', async () => {
    const { success } = await deleteReceipt('exp-B', 0, ADMIN_A)

    expect(success).toBe(false)
    expect(patchMock).not.toHaveBeenCalled()

    const ours = await deleteReceipt('exp-A', 0, ADMIN_A)
    expect(ours.success).toBe(true)
    expect(patchMock).toHaveBeenCalledWith('exp-A')
  })
})
