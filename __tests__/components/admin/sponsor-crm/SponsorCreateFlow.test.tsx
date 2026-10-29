/**
 * @vitest-environment jsdom
 *
 * The one create flow (#1704, E3) covers what the retired SponsorAddModal
 * did: start on a given tier, add an EXISTING company to this conference,
 * or create a new company on the spot (adding an existing one: see
 * useSponsorCRMFormMutations.test.tsx).
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const m = vi.hoisted(() => ({ create: vi.fn(), notify: vi.fn() }))

vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: m.notify }),
}))
vi.mock('@/lib/trpc/client', () => {
  const emptyQuery = () => ({ data: [] })
  const invalidate = { invalidate: vi.fn() }
  return {
    api: {
      useUtils: () => ({ sponsor: { list: invalidate } }),
      sponsor: {
        list: { useQuery: emptyQuery },
        create: {
          useMutation: (options: {
            onSuccess: (data: { _id: string }) => void
          }) => ({
            mutateAsync: async (input: unknown) => {
              m.create(input)
              options.onSuccess({ _id: 'sp-new' })
            },
            isPending: false,
          }),
        },
        tiers: {
          listByConference: {
            useQuery: () => ({
              data: [{ _id: 'tier-gold', title: 'Gold', tierType: 'standard' }],
            }),
          },
        },
        crm: { listOrganizers: { useQuery: emptyQuery } },
      },
    },
  }
})
vi.mock('@/hooks/useSponsorCRMFormMutations', () => ({
  useSponsorCRMFormMutations: () => ({
    handleSubmit: vi.fn(),
    isPending: false,
  }),
}))
vi.mock('@/components/admin/sponsor-crm/SponsorPipelineView', () => ({
  SponsorPipelineView: ({ formData }: { formData: { tierId: string } }) => (
    <div data-testid="tier">{formData.tierId}</div>
  ),
}))

import { SponsorCRMForm } from '@/components/admin/sponsor-crm/SponsorCRMForm'
import { SponsorCombobox } from '@/components/admin/sponsor-crm/form/SponsorCombobox'

afterEach(cleanup)

it('create mode starts on the preselected tier', () => {
  render(
    <SponsorCRMForm
      conferenceId="conf"
      sponsor={null}
      isOpen
      initialTierId="tier-gold"
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />,
  )
  expect(screen.getByTestId('tier')).toHaveTextContent('tier-gold')
})

it('creates a new company and selects it', async () => {
  const onChange = vi.fn()
  render(
    <SponsorCombobox value="" onChange={onChange} availableSponsors={[]} />,
  )
  fireEvent.click(screen.getByText('+ Create new sponsor'))
  fireEvent.change(screen.getByPlaceholderText('Acme Corp'), {
    target: { value: 'NewCo' },
  })
  fireEvent.change(screen.getByPlaceholderText('https://acme.com'), {
    target: { value: 'https://newco.test' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create' }))
  await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('sp-new'))
  expect(m.create).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'NewCo', website: 'https://newco.test' }),
  )
})
