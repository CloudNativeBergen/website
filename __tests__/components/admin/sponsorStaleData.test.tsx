/**
 * @vitest-environment jsdom
 *
 * After a save, the sponsor admin refetches every cached read that shows the
 * saved data. The tRPC client is a recording stand-in: each test renders a
 * component, fires the mutation's onSuccess and checks what was invalidated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook, cleanup } from '@testing-library/react'
import { mockSponsor } from '@/__mocks__/sponsor-data'
import type { Conference } from '@/lib/conference/types'

const m = vi.hoisted(() => ({
  invalidated: [] as Array<{ path: string; input: unknown }>,
  mutations: new Map<string, { onSuccess?: (data?: unknown) => unknown }>(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: m.refresh,
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/sponsors',
}))

vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))
vi.mock('@/components/admin', async (orig) => ({
  ...(await orig<object>()),
  useNotification: () => ({ showNotification: vi.fn() }),
}))

vi.mock('@/lib/trpc/client', () => {
  // `utils.a.b.invalidate(input)` records `a.b`.
  const utils = (path: string[]): unknown =>
    new Proxy(() => {}, {
      get: (_t, key: string) =>
        key === 'invalidate'
          ? (input?: unknown) => {
              m.invalidated.push({ path: path.join('.'), input })
              return Promise.resolve()
            }
          : utils([...path, key]),
    })
  const api = (path: string[]): unknown =>
    new Proxy(() => {}, {
      get: (_t, key: string) => {
        if (key === 'useUtils') return () => utils([])
        if (key === 'useMutation')
          return (options: { onSuccess?: () => void } = {}) => {
            m.mutations.set(path.join('.'), options)
            return {
              mutate: vi.fn(),
              mutateAsync: vi.fn(),
              isPending: false,
              reset: vi.fn(),
            }
          }
        if (key === 'useQuery')
          return () => ({ data: undefined, isLoading: false, error: null })
        if (key === 'useInfiniteQuery')
          return () => ({ data: undefined, isLoading: false })
        return api([...path, key])
      },
    })
  return { api: api([]) }
})

import { useRefreshSponsor } from '@/hooks/useRefreshSponsor'
import { SponsorActivityInput } from '@/components/admin/sponsor/SponsorActivityInput'
import { SponsorActivityFeedWidget } from '@/components/admin/sponsor-crm/widgets/SponsorActivityFeedWidget'
import { SponsorContactEditor } from '@/components/admin/sponsor/SponsorContactEditor'
import { SponsorEmailTemplateEditor } from '@/components/admin/sponsor/SponsorEmailTemplateEditor'
import { ContractTemplateEditorPage } from '@/components/admin/sponsor/ContractTemplateEditorPage'
import { SponsorTierEditor } from '@/components/admin/sponsor/SponsorTierEditor'

const conference = {
  _id: 'conf-1',
  title: 'Cloud Native Day',
  organizer: 'Cloud Native Bergen',
} as unknown as Conference

const paths = () => m.invalidated.map((c) => c.path)
const succeed = async (mutation: string, data?: unknown) => {
  const options = m.mutations.get(mutation)
  expect(options, `${mutation} was not set up`).toBeDefined()
  await options!.onSuccess?.(data)
}

/** What the shared refresh invalidates for sponsor `sfc-1`. */
const SPONSOR_REFRESH = [
  'sponsor.crm.getById',
  'sponsor.crm.getOverview',
  'sponsor.crm.getContacts',
  'sponsor.crm.activities.list',
  'sponsor.crm.list',
]

beforeEach(() => {
  cleanup()
  m.invalidated.length = 0
  m.mutations.clear()
  m.refresh.mockClear()
})

describe('useRefreshSponsor', () => {
  it('refetches the sponsor page, the board and the activity log', () => {
    const { result } = renderHook(() => useRefreshSponsor())
    result.current('sfc-1')
    expect(paths()).toEqual(expect.arrayContaining(SPONSOR_REFRESH))
    expect(paths()).toContain('sponsor.crm.activities.log')
    expect(m.invalidated).toContainEqual({
      path: 'sponsor.crm.getById',
      input: { id: 'sfc-1' },
    })
  })
})

describe('sponsor saves refresh the sponsor', () => {
  it('an activity posted from the timeline', async () => {
    render(<SponsorActivityInput sponsorForConferenceId="sfc-1" />)
    await succeed('sponsor.crm.activities.create')
    expect(paths()).toEqual(expect.arrayContaining(SPONSOR_REFRESH))
  })

  it('a note saved from the activity widget', async () => {
    render(
      <SponsorActivityFeedWidget sponsorId="sfc-1" onNewActivity={() => {}} />,
    )
    await succeed('sponsor.crm.activities.create')
    expect(paths()).toEqual(expect.arrayContaining(SPONSOR_REFRESH))
    expect(m.invalidated).toContainEqual({
      path: 'sponsor.crm.getOverview',
      input: { id: 'sfc-1' },
    })
  })

  it('a contacts save', async () => {
    const sponsor = mockSponsor()
    render(<SponsorContactEditor sponsorForConference={sponsor} />)
    await succeed('sponsor.crm.update')
    expect(m.invalidated).toContainEqual({
      path: 'sponsor.crm.getContacts',
      input: { id: sponsor._id },
    })
    expect(m.invalidated).toContainEqual({
      path: 'sponsor.crm.getById',
      input: { id: sponsor._id },
    })
  })
})

describe('template saves refresh the template reads', () => {
  it('contract template create and update', async () => {
    render(
      <ContractTemplateEditorPage conference={conference} templateId="tpl-1" />,
    )
    await succeed('sponsor.contractTemplates.create', { _id: 'tpl-2' })
    await succeed('sponsor.contractTemplates.update')
    expect(paths()).toEqual([
      'sponsor.contractTemplates',
      'sponsor.contractTemplates',
    ])
  })

  it('email template update', async () => {
    render(
      <SponsorEmailTemplateEditor conference={conference} onSaved={() => {}} />,
    )
    await succeed('sponsor.emailTemplates.update')
    expect(paths()).toEqual(['sponsor.emailTemplates'])
  })
})

describe('tier changes refresh the tier management', () => {
  it('re-renders the server data and refetches the tiers', async () => {
    const { getAllByText } = render(
      <SponsorTierEditor conferenceId="conf-1" sponsorTiers={[]} />,
    )
    getAllByText('Create Tier')[0].click()
    await succeed('sponsor.tiers.create', { _id: 'tier-1', title: 'Gold' })
    expect(m.refresh).toHaveBeenCalled()
    expect(paths()).toContain('sponsor.tiers.listByConference')
  })
})
