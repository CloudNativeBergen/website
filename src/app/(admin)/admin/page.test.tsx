import { beforeEach, describe, expect, it, vi } from 'vitest'

const getConference = vi.fn()
const resolve = vi.fn()

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...a: unknown[]) => getConference(...a),
}))
vi.mock('@/lib/settings/activation-server', () => ({
  resolveActivationChecklist: (...a: unknown[]) => resolve(...a),
}))
vi.mock('@/components/admin/dashboard/AdminDashboard', () => ({
  AdminDashboard: () => null,
}))

import AdminDashboardPage from './page'

// The page wraps DashboardContent in Suspense; render that child directly.
async function renderContent() {
  const el = AdminDashboardPage() as {
    props: { children: { type: () => Promise<unknown> } }
  }
  return el.props.children.type()
}

const conference = {
  _id: 'c1',
  visibility: 'live',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
}

describe('/admin event facts opt-in', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getConference.mockReset().mockResolvedValue({ conference })
    resolve.mockReset().mockResolvedValue({ allDone: true, event: null })
  })

  it('does not opt in outside the window', async () => {
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'))
    await renderContent()
    expect(resolve).toHaveBeenCalledWith(conference, undefined, {
      eventFacts: false,
    })
    expect(getConference).toHaveBeenCalledTimes(1)
  })

  it('opts in, and reads the schedule, inside the window', async () => {
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'))
    await renderContent()
    expect(resolve).toHaveBeenCalledWith(conference, undefined, {
      eventFacts: true,
    })
    expect(getConference).toHaveBeenLastCalledWith({
      topics: true,
      schedule: true,
    })
  })
})
