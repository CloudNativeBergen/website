/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { BUILTIN_TEMPLATE } from '@/lib/marketing/template'

const h = vi.hoisted(() => ({
  addBuiltin: vi.fn(),
  create: vi.fn(),
  notify: vi.fn(),
  invalidated: [] as string[],
  added: undefined as undefined | ((result: { tasks: number }) => void),
  failed: undefined as undefined | (() => void),
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.notify }),
}))
const state = { creating: false }
vi.mock('@/lib/trpc/client', () => {
  const invalidate = (name: string) => () => {
    h.invalidated.push(name)
  }
  return {
    api: {
      useUtils: () => ({
        marketing: {
          plan: { get: { invalidate: invalidate('plan') } },
          campaign: { invalidate: invalidate('campaign') },
          report: { invalidate: invalidate('report') },
        },
        social: { listVariants: { invalidate: invalidate('social') } },
      }),
      marketing: {
        campaign: {
          addBuiltin: {
            useMutation: ({
              onSuccess,
              onError,
            }: {
              onSuccess: (result: { tasks: number }) => void
              onError: () => void
            }) => {
              h.added = onSuccess
              h.failed = onError
              return {
                mutate: h.addBuiltin,
                isPending: false,
                error: null,
              }
            },
          },
          editing: {
            useQuery: () => ({
              data: null,
              error: null,
              isFetchedAfterMount: false,
              isError: false,
            }),
          },
          create: {
            useMutation: () => ({
              mutate: h.create,
              isPending: state.creating,
            }),
          },
          update: {
            useMutation: () => ({ mutate: vi.fn(), isPending: false }),
          },
        },
      },
    },
  }
})
const { AddCampaignDialog } = await import('./AddCampaignDialog')

const ALL_KEYS = BUILTIN_TEMPLATE.campaigns.map((campaign) => campaign.key)
beforeEach(() => {
  vi.clearAllMocks()
  h.invalidated.length = 0
})
afterEach(cleanup)

describe('adding a built-in Campaign on demand', () => {
  it('offers only the built-ins the plan is missing, and sends the key', () => {
    render(
      <AddCampaignDialog
        campaignKeys={['cfp', 'speakers']}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Add CFP' })).toBe(null)
    expect(screen.queryByRole('button', { name: 'Add Speakers' })).toBe(null)
    const keynotes = within(screen.getByText('Keynotes').closest('li')!)
    expect(
      keynotes.getByText('Speakers announced −28 d → Speakers announced'),
    ).toBeInTheDocument()
    expect(
      keynotes.getByText(
        '3 Tasks, plus what its Recipes create: Keynote speaker card',
      ),
    ).toBeInTheDocument()
    expect(keynotes.getByText('Optional')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add Keynotes' }))
    expect(h.addBuiltin).toHaveBeenCalledTimes(1)
    expect(h.addBuiltin).toHaveBeenCalledWith({ key: 'keynotes' })
  })
  it('reports the Tasks it created and refreshes the plan', () => {
    const close = vi.fn()
    render(<AddCampaignDialog campaignKeys={[]} onClose={close} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Keynotes' }))
    h.added?.({ tasks: 9 })
    expect(h.notify).toHaveBeenCalledWith({
      type: 'success',
      title: 'Campaign added',
      message: '9 Tasks created.',
    })
    expect([...h.invalidated].sort()).toEqual([
      'campaign',
      'plan',
      'report',
      'social',
    ])
    h.added?.({ tasks: 1 })
    expect(h.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: '1 Task created.' }),
    )
    expect(close).toHaveBeenCalled()
  })
  it('hides the switch and opens the form when no built-in is missing', () => {
    render(<AddCampaignDialog campaignKeys={ALL_KEYS} onClose={vi.fn()} />)
    // Fails on a value: with a built-in missing, this same query FINDS it.
    expect(screen.queryByRole('group', { name: 'How to add a Campaign' })).toBe(
      null,
    )
    expect(screen.getByLabelText('Title')).toHaveValue('')
  })
  it('falls back to the hand-built form when the last built-in is taken while it is open', () => {
    const missingOne = ALL_KEYS.filter((key) => key !== 'keynotes')
    const { rerender } = render(
      <AddCampaignDialog campaignKeys={missingOne} onClose={vi.fn()} />,
    )
    expect(
      screen.getByRole('button', { name: 'Add Keynotes' }),
    ).toBeInTheDocument()
    rerender(<AddCampaignDialog campaignKeys={ALL_KEYS} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Title')).toHaveValue('')
    expect(screen.queryByRole('group', { name: 'How to add a Campaign' })).toBe(
      null,
    )
  })
  it('refetches the plan when an add fails, so a built-in someone else just added stops being offered', () => {
    render(<AddCampaignDialog campaignKeys={[]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Keynotes' }))
    act(() => h.failed?.())
    expect(h.invalidated).toEqual(['plan'])
    expect(screen.getByRole('button', { name: 'Add Keynotes' })).toBeEnabled()
  })
  it('locks the switch while the hand-built Campaign is saving: switching would unmount the editor that owns the write', () => {
    state.creating = true
    render(<AddCampaignDialog campaignKeys={[]} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Your own' }))
    expect(screen.getByRole('button', { name: 'Built-in' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Built-in' }))
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    state.creating = false
  })
  it('switches to the hand-built form and keeps the switch', () => {
    render(<AddCampaignDialog campaignKeys={[]} onClose={vi.fn()} />)
    expect(
      screen.getByRole('group', { name: 'How to add a Campaign' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Your own' }))
    expect(screen.getByLabelText('Title')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Your own' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

describe('the Optional flag on a hand-built Campaign', () => {
  it('is off by default and travels with the create', () => {
    render(<AddCampaignDialog campaignKeys={ALL_KEYS} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Community push' },
    })
    fireEvent.change(screen.getByLabelText(/Outcome page/), {
      target: { value: '/tickets' },
    })
    expect(screen.getByLabelText('Optional')).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Save Campaign' }))
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Community push', optional: false }),
    )

    fireEvent.click(screen.getByLabelText('Optional'))
    fireEvent.click(screen.getByRole('button', { name: 'Save Campaign' }))
    expect(h.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Community push', optional: true }),
    )
  })
})
