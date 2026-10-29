/**
 * @vitest-environment jsdom
 */
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import { mockSponsor } from '@/__mocks__/sponsor-data'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import {
  SponsorCard,
  getCardStatus,
} from '@/components/admin/sponsor-crm/SponsorCard'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

// jsdom ships no ResizeObserver; Headless UI's Menu observes its anchor when
// the panel opens.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const NOW = new Date('2026-02-15T12:00:00Z')

function renderCard(props: Partial<Parameters<typeof SponsorCard>[0]> = {}) {
  const onEdit = vi.fn()
  const onToggleSelect = vi.fn()
  render(
    <NotificationProvider>
      <SponsorCard
        sponsor={mockSponsor()}
        currentView="pipeline"
        onEdit={onEdit}
        onToggleSelect={onToggleSelect}
        {...props}
      />
    </NotificationProvider>,
  )
  return { onEdit, onToggleSelect }
}

const status = (
  overrides: Partial<SponsorForConferenceExpanded>,
  view: 'pipeline' | 'contract' | 'invoice',
) => getCardStatus(mockSponsor(overrides), view)

describe('SponsorCard status line', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('pipeline: a past follow-up is overdue', () => {
    expect(status({ nextFollowUpAt: '2026-02-10' }, 'pipeline')).toMatchObject({
      text: 'Follow up 10. feb.',
      overdue: true,
    })
  })

  it('pipeline: a future follow-up is not overdue', () => {
    expect(status({ nextFollowUpAt: '2026-02-20' }, 'pipeline')).toMatchObject({
      text: 'Follow up 20. feb.',
      overdue: false,
    })
  })

  it('pipeline: no follow-up shows days since contact, warned when stale', () => {
    expect(
      status(
        {
          lastActivity: {
            activityType: 'note',
            description: '',
            createdAt: '2026-02-03T12:00:00Z',
          } as SponsorForConferenceExpanded['lastActivity'],
        },
        'pipeline',
      ),
    ).toMatchObject({
      text: 'No contact for 12 days',
      overdue: false,
      warning: true,
    })
  })

  it('contract: shows signature status and how long it has waited', () => {
    expect(
      status(
        {
          contractStatus: 'contract-sent',
          signatureStatus: 'pending',
          contractSentAt: '2026-02-10T12:00:00Z',
        },
        'contract',
      ).text,
    ).toBe('Awaiting signature · waiting 5 days')
  })

  it('invoice: due date while it is still in time', () => {
    expect(
      status({ invoiceStatus: 'sent', invoiceDueAt: '2026-03-01' }, 'invoice'),
    ).toMatchObject({ text: 'Due 1. mars', overdue: false })
  })

  it('invoice: overdue since the due date', () => {
    expect(
      status({ invoiceStatus: 'sent', invoiceDueAt: '2026-02-01' }, 'invoice'),
    ).toMatchObject({ text: 'Overdue since 1. feb.', overdue: true })
  })
})

describe('SponsorCard', () => {
  afterEach(cleanup)

  it('has an accessible name with the sponsor name and status', () => {
    renderCard({ sponsor: mockSponsor({ nextFollowUpAt: '2099-01-02' }) })
    expect(
      screen.getByRole('button', { name: /^Acme Corporation, Follow up/ }),
    ).toBeInTheDocument()
  })

  it('opens the panel on click and on Enter', () => {
    const { onEdit } = renderCard()
    fireEvent.click(screen.getByText('Acme Corporation'))
    fireEvent.keyDown(
      screen.getByRole('button', { name: /^Acme Corporation,/ }),
      { key: 'Enter' },
    )
    expect(onEdit).toHaveBeenCalledTimes(2)
  })

  it('hides the checkbox until hover, focus or selection mode', () => {
    renderCard()
    const wrapper = screen.getByRole('checkbox', {
      name: 'Select Acme Corporation',
    }).parentElement!
    expect(wrapper).toHaveClass('opacity-0', 'group-hover:opacity-100')
    cleanup()
    renderCard({ isSelectionMode: true })
    expect(
      screen.getByRole('checkbox', { name: 'Select Acme Corporation' })
        .parentElement,
    ).toHaveClass('opacity-100')
  })

  it('toggles selection from the checkbox without opening the sponsor', () => {
    const { onEdit, onToggleSelect } = renderCard()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onToggleSelect).toHaveBeenCalledTimes(1)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('selects instead of opening in selection mode', () => {
    const { onEdit, onToggleSelect } = renderCard({ isSelectionMode: true })
    fireEvent.click(screen.getByText('Acme Corporation'))
    expect(onToggleSelect).toHaveBeenCalledTimes(1)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('menu has exactly three items and opening it does not open the sponsor', () => {
    const { onEdit } = renderCard({ onEmail: vi.fn() })
    fireEvent.click(
      screen.getByRole('button', { name: 'Options for Acme Corporation' }),
    )
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(
      ['Send email', 'Copy link', 'Open sponsor page'],
    )
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('Copy link copies the absolute board URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const { onEdit } = renderCard()
    fireEvent.click(
      screen.getByRole('button', { name: 'Options for Acme Corporation' }),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/admin/sponsors/crm?sponsor=sfc-123&view=pipeline`,
      ),
    )
    expect(onEdit).not.toHaveBeenCalled()
  })
})
