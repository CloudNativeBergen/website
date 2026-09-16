/** @vitest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import type { Conference } from '@/lib/conference/types'
import { MarketingDueWidget } from '@/components/admin/dashboard/widgets/MarketingDueWidget'

const fetchMarketingDue = vi.hoisted(() => vi.fn())
vi.mock('@/lib/dashboard/fetchers', () => ({ fetchMarketingDue }))
const conference = { _id: 'a' } as Conference
beforeEach(() => fetchMarketingDue.mockReset())

it('renders task editor links, assignees, and distinct due-today/overdue badges', async () => {
  fetchMarketingDue.mockResolvedValue({
    tasks: [
      {
        id: 'a',
        title: 'Share programme',
        assigneeName: 'Ingrid',
        dueAt: '2026-09-16T10:00:00Z',
        overdue: false,
        href: '/admin/marketing/tasks/a',
      },
      {
        id: 'b',
        title: 'Render artwork',
        assigneeName: 'Unassigned',
        dueAt: '2026-09-15T10:00:00Z',
        overdue: true,
        href: '/admin/marketing/tasks/b',
      },
    ],
  })
  render(<MarketingDueWidget conference={conference} />)
  expect(
    await screen.findByRole('link', {
      name: /Share programme/,
    }),
  ).toHaveAttribute('href', '/admin/marketing/tasks/a')
  expect(screen.getByRole('link', { name: /Render artwork/ })).toHaveAttribute(
    'href',
    '/admin/marketing/tasks/b',
  )
  expect(screen.getByText('Ingrid')).toBeVisible()
  expect(screen.getByText('Unassigned')).toBeVisible()
  expect(screen.getByText('Due today')).toBeVisible()
  expect(screen.getByText(/Overdue ·/)).toBeVisible()
  expect(fetchMarketingDue).toHaveBeenCalledTimes(1)
})
it('renders the empty state from an empty successful result', async () => {
  fetchMarketingDue.mockResolvedValue({ tasks: [] })
  render(<MarketingDueWidget conference={conference} />)
  expect(await screen.findByText('No marketing tasks due')).toBeVisible()
})
it('surfaces failure and retries through the same fetcher', async () => {
  fetchMarketingDue
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ tasks: [] })
  render(<MarketingDueWidget conference={conference} />)
  expect(await screen.findByText('Failed to load data')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('No marketing tasks due')).toBeVisible()
  expect(fetchMarketingDue).toHaveBeenCalledTimes(2)
})
