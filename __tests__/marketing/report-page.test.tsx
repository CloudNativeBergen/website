import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ReportPage from '@/app/(admin)/admin/marketing/report/page'

const h = vi.hoisted(() => ({ session: vi.fn(), organizer: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthSession: h.session }))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: h.organizer,
}))
vi.mock('@/components/admin/marketing/report', () => ({
  MarketingReportPage: () => 'Report content',
}))

beforeEach(() => {
  vi.clearAllMocks()
  h.session.mockResolvedValue({ speaker: { _id: 'speaker-A' } })
  h.organizer.mockResolvedValue(true)
})
describe('Report page organizer branch', () => {
  it('renders the report for an organizer of the request organization', async () => {
    expect(renderToStaticMarkup(await ReportPage())).toBe('Report content')
    expect(h.organizer).toHaveBeenCalledWith({ _id: 'speaker-A' })
  })
  it('renders an explicit denial when organization authorization fails', async () => {
    h.organizer.mockResolvedValue(false)
    expect(renderToStaticMarkup(await ReportPage())).toContain('Access Denied')
  })
})
