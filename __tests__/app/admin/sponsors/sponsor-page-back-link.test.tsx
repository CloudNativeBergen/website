/**
 * @vitest-environment jsdom
 *
 * The sponsor page's back arrow returns to the board mode it was opened from.
 * Only the known modes pass through; anything else falls back to the board.
 */
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'cloudnativebergen.dev' }),
}))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('@/lib/authz/page-guard', () => ({
  denyNonOrganizer: async () => null,
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: { _id: 'conf', title: 'Conf' },
    error: null,
  }),
}))
vi.mock('@/lib/sponsor-crm/sanity', () => ({
  getSponsorOverview: async () => ({ data: { _id: 'sfc-1' } }),
}))
vi.mock('@/lib/features/ticketing', () => ({
  isTicketingEnabledForConference: async () => false,
}))
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: async () => false,
}))
vi.mock('@/components/admin', () => ({ ErrorDisplay: () => null }))
vi.mock('@/app/(admin)/admin/sponsors/[id]/SponsorDashboardClient', () => ({
  SponsorDashboardClient: ({ backHref }: { backHref: string }) => (
    <a href={backHref}>back</a>
  ),
}))

import SponsorDashboardPage from '@/app/(admin)/admin/sponsors/[id]/page'

afterEach(cleanup)

async function backHref(board?: string) {
  render(
    await SponsorDashboardPage({
      params: Promise.resolve({ id: 'sfc-1' }),
      searchParams: Promise.resolve({ board }),
    }),
  )
  return screen.getByText('back').getAttribute('href')
}

describe('/admin/sponsors/[id] back link', () => {
  it.each([
    ['contract', '/admin/sponsors/crm?board=contract'],
    ['invoice', '/admin/sponsors/crm?board=invoice'],
    [undefined, '/admin/sponsors/crm'],
    ['pipeline', '/admin/sponsors/crm'],
    ['javascript:alert(1)', '/admin/sponsors/crm'],
  ])('board=%s goes back to %s', async (board, expected) => {
    expect(await backHref(board)).toBe(expected)
  })
})
