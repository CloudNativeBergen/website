/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SponsorAddModal } from '@/components/admin/sponsor/SponsorAddModal'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type {
  ConferenceSponsor,
  SponsorTierExisting,
} from '@/lib/sponsor/types'

const state = vi.hoisted(() => ({
  crmUpdatePending: false,
  // A STABLE empty array — returning a fresh `[]` per render would retrigger
  // the component's list-sync effect on every render (infinite loop / OOM).
  emptyList: [] as unknown[],
}))

vi.mock('@/lib/trpc/client', () => {
  const idle = () => ({ mutateAsync: vi.fn(), isPending: false })
  return {
    api: {
      sponsor: {
        list: { useQuery: () => ({ data: state.emptyList }) },
        create: { useMutation: idle },
        update: { useMutation: idle },
        crm: {
          create: { useMutation: idle },
          update: {
            useMutation: () => ({
              mutateAsync: vi.fn(),
              isPending: state.crmUpdatePending,
            }),
          },
        },
      },
      useUtils: () => ({ sponsor: { list: { invalidate: vi.fn() } } }),
    },
  }
})

vi.mock('@/components/admin/sponsor/SponsorLogoEditor', () => ({
  SponsorLogoEditor: () => <div data-testid="logo-editor" />,
}))

const sponsorTiers = [
  { _id: 't1', title: 'Gold', price: [] },
] as unknown as SponsorTierExisting[]

const editingSponsor = {
  _sfcId: 'sfc-1',
  sponsor: { _id: 's1', name: 'Acme', website: 'https://acme.test' },
  tier: { _id: 't1', title: 'Gold', tagline: '' },
} as unknown as ConferenceSponsor

function renderModal() {
  render(
    <NotificationProvider>
      <SponsorAddModal
        isOpen
        onClose={vi.fn()}
        conferenceId="conf-1"
        sponsorTiers={sponsorTiers}
        editingSponsor={editingSponsor}
      />
    </NotificationProvider>,
  )
}

afterEach(() => {
  cleanup()
  state.crmUpdatePending = false
})

describe('SponsorAddModal double-submit guard (C7)', () => {
  it('disables submit while the CRM update mutation is pending', () => {
    state.crmUpdatePending = true
    renderModal()
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  })

  it('keeps submit enabled for a valid form when nothing is pending', () => {
    state.crmUpdatePending = false
    renderModal()
    expect(screen.getByRole('button', { name: 'Update Sponsor' })).toBeEnabled()
  })
})
