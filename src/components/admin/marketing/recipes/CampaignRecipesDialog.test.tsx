/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  LIBRARY,
  allowedPlaceholders,
  editsOf,
  libraryEntry,
  type LibraryId,
} from '@/lib/marketing/library'

const rows = LIBRARY.map((entry) => ({
  id: entry.id,
  title: entry.title,
  description: entry.description,
  recurring: entry.recipes.some((recipe) => recipe.cadence),
  hasImage: entry.recipes.some((recipe) => recipe.alt),
  channels: entry.recipes.flatMap((recipe) =>
    recipe.kind === 'publishing' && recipe.channel ? [recipe.channel] : [],
  ),
  placeholders: allowedPlaceholders(entry),
  defaults: editsOf(entry, entry.recipes),
}))
const attachedRow = (id: LibraryId) => ({
  entry: id,
  edits: editsOf(libraryEntry(id), libraryEntry(id).recipes),
})

const h = vi.hoisted(() => ({
  attach: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  refetch: vi.fn(),
  notify: vi.fn(),
  invalidated: [] as string[],
}))
const state = {
  rev: 'rev-1',
  attached: [] as ReturnType<typeof attachedRow>[],
}
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.notify }),
}))
vi.mock('@/lib/trpc/client', () => {
  const mutation = (mutate: typeof h.attach) => ({
    useMutation: () => ({
      mutate,
      isPending: false,
      error: null,
      reset: vi.fn(),
    }),
  })
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
      }),
      marketing: {
        campaign: {
          editing: {
            useQuery: () => ({
              data: {
                _id: 'campaign',
                _rev: state.rev,
                title: 'Final push',
                attached: state.attached,
              },
              error: null,
              isError: false,
              refetch: h.refetch,
            }),
          },
          recipes: {
            library: {
              useQuery: () => ({ data: rows, error: null, isError: false }),
            },
            attach: mutation(h.attach),
            update: mutation(h.update),
            remove: mutation(h.remove),
          },
        },
      },
    },
  }
})
const { CampaignRecipesDialog } = await import('./CampaignRecipesDialog')

beforeEach(() => {
  vi.clearAllMocks()
  h.invalidated.length = 0
  state.rev = 'rev-1'
  state.attached = [attachedRow('speakerCard')]
})
afterEach(cleanup)

const open = () =>
  render(<CampaignRecipesDialog campaignId="campaign" onClose={vi.fn()} />)

describe('attaching a Library Recipe', () => {
  it('sends the entry, the Library defaults and the FRESHEST revision', () => {
    const { rerender } = open()
    fireEvent.click(
      screen.getByRole('button', { name: 'Attach Sponsor thank-you card' }),
    )
    // Somebody else's write lands while the form is open. Nothing here is
    // latched, so the attach must go out against the revision that arrived —
    // not the one the dialog was opened on.
    state.rev = 'rev-2'
    rerender(<CampaignRecipesDialog campaignId="campaign" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Attach Recipe' }))
    expect(h.attach).toHaveBeenCalledTimes(1)
    expect(h.attach).toHaveBeenCalledWith({
      campaignId: 'campaign',
      rev: 'rev-2',
      entry: 'sponsorCard',
      edits: editsOf(
        libraryEntry('sponsorCard'),
        libraryEntry('sponsorCard').recipes,
      ),
    })
  })
  it('does not offer a Recipe the Campaign already has', () => {
    open()
    expect(screen.queryByRole('button', { name: 'Attach Speaker card' })).toBe(
      null,
    )
    expect(
      screen.getByRole('button', { name: 'Edit Speaker card' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'LinkedIn 2/week · Bluesky 3/week · Speakers notified +7 d → Conference −7 d',
      ),
    ).toBeInTheDocument()
  })
  it('drops a Channel that is switched off from the edits it sends', () => {
    open()
    fireEvent.click(
      screen.getByRole('button', { name: 'Attach Sponsor thank-you card' }),
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'LinkedIn' }))
    fireEvent.click(screen.getByRole('button', { name: 'Attach Recipe' }))
    expect(h.attach.mock.calls[0][0].edits.channels).toEqual({
      bluesky: editsOf(
        libraryEntry('sponsorCard'),
        libraryEntry('sponsorCard').recipes,
      ).channels.bluesky,
    })
  })
})

describe('editing an attached Recipe', () => {
  it('sends the edited fields under the attached entry', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Speaker card' }))
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Our speaker card' },
    })
    fireEvent.change(screen.getByLabelText('Bluesky posts per week'), {
      target: { value: '5' },
    })
    fireEvent.change(screen.getAllByLabelText('Days from Milestone')[1], {
      target: { value: '-3' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    expect(h.update).toHaveBeenCalledTimes(1)
    const input = h.update.mock.calls[0][0]
    expect(input.campaignId).toBe('campaign')
    expect(input.rev).toBe('rev-1')
    expect(input.entry).toBe('speakerCard')
    expect(input.edits.title).toBe('Our speaker card')
    expect(input.edits.channels.bluesky.perWeek).toBe(5)
    expect(input.edits.window).toEqual({
      from: { milestone: 'CFP_NOTIFY', offsetDays: 7 },
      to: { milestone: 'CONFERENCE_START', offsetDays: -3 },
    })
  })
  it('blocks Save on a placeholder the Recipe cannot fill in', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Speaker card' }))
    fireEvent.change(screen.getByLabelText('LinkedIn copy'), {
      target: { value: 'Hello {recipient}' },
    })
    expect(screen.getByRole('alert').textContent).toBe(
      'LinkedIn copy: {recipient} cannot be filled in for this Recipe.',
    )
    expect(screen.getByRole('button', { name: 'Save Recipe' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    expect(h.update).not.toHaveBeenCalled()
  })
  it('warns about a rate over the ceiling but still saves it', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Speaker card' }))
    fireEvent.change(screen.getByLabelText('LinkedIn posts per week'), {
      target: { value: '8' },
    })
    expect(
      screen.getByText(
        'LinkedIn: 8 posts a week is over the ceiling of 1 a day.',
      ),
    ).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save Recipe' })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(h.update.mock.calls[0][0].edits.channels.linkedin.perWeek).toBe(8)
  })
})

describe('removing an attached Recipe', () => {
  it('confirms first, then sends the entry and the revision', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Speaker card' }))
    expect(h.remove).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        'Removing it stops creation. The Tasks it has already created stay in the Campaign.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Recipe' }))
    expect(h.remove).toHaveBeenCalledWith({
      campaignId: 'campaign',
      rev: 'rev-1',
      entry: 'speakerCard',
    })
  })
})
