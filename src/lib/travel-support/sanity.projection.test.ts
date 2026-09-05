import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #863. `getTravelSupportById` opened with a bare `...` spread over a document
 * carrying `bankingDetails` — beneficiary, IBAN, account number, SWIFT — so it
 * returned every field the schema has, and every field it ever grows, to
 * whoever called it. The guard on `travelSupport.admin.getById` decides WHO may
 * read; this projection decides WHAT is read, and the two are independent
 * controls.
 *
 * TypeScript cannot enforce the second one: a field the query forgot and a field
 * the document lacks both arrive `undefined`, so a projection that silently
 * drops something a consumer needs type-checks perfectly. Hence these cases —
 * the field list is asserted against the query text, and `FIELDS` below must
 * mirror `TravelSupportDetail` exactly.
 */
const fetchMock = vi.fn()
vi.mock('../sanity/client', () => ({
  clientRead: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))
vi.mock('@/lib/sanity/scoped', () => ({ scopedFetch: vi.fn() }))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefViaParentConference: vi.fn(),
  organizationField: vi.fn(),
}))

import { getTravelSupportById } from './sanity'

/** Every member of `TravelSupportDetail`, which the query must project. */
const FIELDS = [
  '_id',
  'status',
  'bankingDetails',
  'totalAmount',
  'approvedAmount',
  'expectedPaymentDate',
  'reviewNotes',
  'speaker',
  'conference',
  'conferenceOrgId',
  'expenses',
]

/** Every member of `BankingDetails`. */
const BANKING_FIELDS = [
  'beneficiaryName',
  'bankName',
  'iban',
  'accountNumber',
  'swiftCode',
  'country',
  'preferredCurrency',
]

async function capturedQuery(): Promise<string> {
  fetchMock.mockResolvedValue(null)
  await getTravelSupportById('ts-1', {
    _id: 'sp-requester',
    organizerOrgIds: ['org-A'],
  })
  return fetchMock.mock.calls[0][0] as string
}

/**
 * The projection of the travelSupport DOCUMENT itself — everything before the
 * `expenses` sub-query, which projects a different type (`travelExpense`,
 * which carries no banking fields) and is deliberately left as it was.
 */
async function documentProjection(): Promise<string> {
  const query = await capturedQuery()
  return query.slice(query.indexOf('[0]'), query.indexOf('"expenses"'))
}

beforeEach(() => vi.clearAllMocks())

describe('getTravelSupportById projects explicitly (#863)', () => {
  it('does not spread the document', async () => {
    expect(await documentProjection()).not.toContain('...')
  })

  it('projects every field its type promises', async () => {
    const projection = await documentProjection()
    for (const field of FIELDS.filter((f) => f !== 'expenses')) {
      expect(projection).toContain(field)
    }
    expect(await capturedQuery()).toContain('"expenses"')
  })

  it('projects the banking fields the payout pane renders', async () => {
    // Explicit here too: `bankingDetails` as a bare field would re-open the
    // same spread one level down.
    const projection = await documentProjection()
    for (const field of BANKING_FIELDS) {
      expect(projection).toContain(field)
    }
  })

  it('resolves the tenant key the ownership guard decides on', async () => {
    // Losing this one fails OPEN rather than loudly: `conferenceOrgId` would be
    // `undefined`, `isOrganizerForOrg` would see a null org, and every organizer
    // would be refused — or, if the comparison ever flips, admitted.
    expect(await documentProjection()).toContain(
      '"conferenceOrgId": conference->organization._ref',
    )
  })

  it('carries the requester predicate IN the query (S7)', async () => {
    // A foreign id must evaluate to null exactly like a nonexistent one —
    // the semantic half of this is pinned with real groq evaluation in
    // `sanity.tenancy.test.ts`; this pins the predicate's presence in the text.
    const query = await capturedQuery()
    expect(query).toContain('_id == $id')
    expect(query).toContain('speaker._ref == $requesterId')
    expect(query).toContain('conference->organization._ref in $orgIds')
  })
})
