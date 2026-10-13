/**
 * @vitest-environment jsdom
 *
 * THE COUNT OF EARLY SIGN-UPS ON A SPONSOR'S RECORD, END TO END IN ONE PIECE
 * (#1348, spec §9): from the row `sponsor.crm.list` answers, through the
 * record as the board opens it (`SponsorCRMForm` → `SponsorContractView` →
 * `SponsorEarlyAccessSection`), to the link an organizer clicks.
 *
 * The count has no read of its own. It is a field of the row the board
 * already holds, so what this pins is that the field survives every hand-off
 * on the way to the page: none of these components asks the server for it.
 *
 * REAL: the `sponsor.crm.list` procedure and its query text (`groq-js`), the
 * form, the contract view and the early-access section.
 * SUPPLIED: the request's conference, the tRPC hooks the record's OTHER parts
 * use, and those parts themselves where they read the server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { initTRPC } from '@trpc/server'
import type { VersionedSanityStore } from '../../../helpers/versionedSanityStore'

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  getConference: vi.fn(),
  /** Every tRPC hook the record calls while it is only being viewed. */
  asked: [] as string[],
}))

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: () => ({
    data: { speaker: { _id: 'sp-admin', name: 'Admin' }, user: {} },
  }),
}))

vi.mock('@/lib/trpc/client', () => {
  const query = (name: string, data: unknown) => ({
    useQuery: () => {
      h.asked.push(name)
      return { data }
    },
  })
  const mutation = (name: string) => ({
    useMutation: () => ({
      mutate: () => h.asked.push(`${name} (called)`),
      isPending: false,
    }),
  })
  return {
    api: {
      useUtils: () => ({
        sponsor: {
          crm: {
            list: { invalidate: vi.fn() },
            healthViolations: { invalidate: vi.fn() },
            earlyAccess: {
              getAddress: {
                fetch: () => h.asked.push('earlyAccess.getAddress (called)'),
              },
            },
          },
        },
      }),
      sponsor: {
        list: query('sponsor.list', []),
        tiers: { listByConference: query('tiers.listByConference', []) },
        contractTemplates: {
          contractReadiness: query('contractReadiness', {
            ready: true,
            canSend: true,
            missing: [],
          }),
          findBest: query('findBest', null),
          generatePdf: mutation('generatePdf'),
        },
        crm: {
          listOrganizers: query('listOrganizers', []),
          checkSignatureStatus: mutation('checkSignatureStatus'),
          earlyAccess: {
            create: mutation('earlyAccess.create'),
            revoke: mutation('earlyAccess.revoke'),
          },
        },
      },
    },
  }
})
vi.mock('@/hooks/useSponsorCRMFormMutations', () => ({
  __esModule: true,
  useSponsorCRMFormMutations: () => ({
    handleSubmit: vi.fn(),
    isPending: false,
  }),
}))
// The record's other parts, which read the server on their own.
vi.mock('@/components/admin/sponsor-crm/ContractReadinessIndicator', () => ({
  __esModule: true,
  ContractReadinessIndicator: () => <div />,
}))
vi.mock('@/components/admin/sponsor-crm/SponsorPortalSection', () => ({
  __esModule: true,
  SponsorPortalSection: () => <div />,
}))
vi.mock('@/components/admin/OrganizerSignatureCapture', () => ({
  __esModule: true,
  OrganizerSignatureCapture: () => <div />,
}))

import type { Context } from '@/server/trpc'
import { sponsorRouter } from '@/server/routers/sponsor'
import { SponsorCRMForm } from '@/components/admin/sponsor-crm/SponsorCRMForm'

const t = initTRPC.context<Context>().create()
const ORG = 'org-a'
const CONF = 'conf-a'
const ref = (id: string) => ({ _type: 'reference', _ref: id })

function caller() {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return t.createCallerFactory(sponsorRouter)({
    req: { headers: new Headers(), url: 'https://conf.example.org' },
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}

const sponsorOfConference = (
  id: string,
  sponsor: string,
  rest: Record<string, unknown> = {},
) => ({
  _id: id,
  _type: 'sponsorForConference',
  _rev: 'r0',
  _createdAt: '2026-01-01T00:00:00Z',
  _updatedAt: '2026-06-01T00:00:00Z',
  conference: ref(CONF),
  sponsor: ref(sponsor),
  status: 'closed-won',
  contractStatus: 'none',
  ...rest,
})
const signup = (id: string, via: string, status = 'confirmed') => ({
  _id: id,
  _type: 'workshopSignup',
  _createdAt: '2026-06-09T08:00:00Z',
  userName: `Person ${id}`,
  userEmail: `${id}@example.com`,
  userWorkOSId: `workos-${id}`,
  workshop: ref('ws-1'),
  conference: ref(CONF),
  status,
  earlyAccessSponsor: { ...ref(via), _weak: true },
})

beforeEach(() => {
  h.asked.length = 0
  h.store!.reset([
    { _id: CONF, _type: 'conference', organization: ref(ORG) },
    { _id: 'sponsor-acme', _type: 'sponsor', name: 'Acme AS' },
    { _id: 'sponsor-globex', _type: 'sponsor', name: 'Globex' },
    sponsorOfConference('sfc-acme', 'sponsor-acme', {
      workshopEarlyAccessToken: '4b1c9d2e-7a55-4f0a-9c3e-1f2a3b4c5d6e',
    }),
    // Its link was revoked after one person had signed up through it.
    sponsorOfConference('sfc-globex', 'sponsor-globex'),
    signup('su-1', 'sfc-acme'),
    signup('su-2', 'sfc-acme'),
    signup('su-3', 'sfc-acme', 'waitlist'),
    signup('su-4', 'sfc-globex'),
  ])
  h.getConference.mockResolvedValue({
    conference: { _id: CONF, organization: { _ref: ORG } },
    domain: 'conf.example.org',
    error: null,
  })
})
afterEach(cleanup)

/** The record of one sponsor, opened from the board on its contract view. */
async function openRecordOf(sponsorForConferenceId: string) {
  const rows = await caller().crm.list()
  const row = rows.find((each) => each._id === sponsorForConferenceId)
  if (!row) throw new Error(`${sponsorForConferenceId} is not on the board`)
  h.asked.length = 0
  render(
    <SponsorCRMForm
      conferenceId={CONF}
      sponsor={row}
      isOpen
      onClose={vi.fn()}
      onSuccess={vi.fn()}
      initialView="contract"
      workshopsEnabled
      sponsorStartSet
    />,
  )
  return within(
    screen.getByRole('heading', { name: 'Workshop early access' })
      .parentElement!,
  )
}

describe('the count of early sign-ups on a sponsor’s record, from the board’s own row', () => {
  it('says how many were made through the sponsor’s links, and links to the list narrowed to it', async () => {
    const section = await openRecordOf('sfc-acme')

    expect(
      section.getByRole('link', { name: '3 early sign-ups' }),
    ).toHaveAttribute(
      'href',
      '/admin/workshops?earlySponsor=sfc-acme#early-sign-ups',
    )
  })

  it('says it for a sponsor whose link was revoked since', async () => {
    const section = await openRecordOf('sfc-globex')

    expect(
      section.getByRole('link', { name: '1 early sign-up' }),
    ).toHaveAttribute(
      'href',
      '/admin/workshops?earlySponsor=sfc-globex#early-sign-ups',
    )
    expect(section.getByRole('button', { name: 'Create link' })).toBeVisible()
  })

  it('asks the server for nothing about sign-ups: the count came with the row', async () => {
    await openRecordOf('sfc-acme')

    expect(
      h.asked.filter((name) => /early|signup|workshop/i.test(name)),
    ).toEqual([])
  })
})
