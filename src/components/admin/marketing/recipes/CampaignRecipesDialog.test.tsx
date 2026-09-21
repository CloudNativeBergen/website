/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  resets: [] as string[],
  handlers: {} as Record<
    string,
    { onSuccess?: (result: never) => void; onError?: () => void }
  >,
}))
const state = {
  rev: 'rev-1',
  attached: [] as ReturnType<typeof attachedRow>[],
  fetching: false,
  errors: {} as Partial<Record<'attach' | 'update' | 'remove', string>>,
}
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.notify }),
}))
vi.mock('@/lib/trpc/client', () => {
  const mutation = (name: 'attach' | 'update' | 'remove') => ({
    useMutation: (options: {
      onSuccess?: (result: never) => void
      onError?: () => void
    }) => {
      h.handlers[name] = options
      return {
        mutate: h[name],
        isPending: false,
        error: state.errors[name] ? { message: state.errors[name] } : null,
        reset: () => h.resets.push(name),
      }
    },
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
        social: { listVariants: { invalidate: invalidate('social') } },
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
              isFetching: state.fetching,
              refetch: h.refetch,
            }),
          },
          recipes: {
            library: {
              useQuery: () => ({ data: rows, error: null, isError: false }),
            },
            attach: mutation('attach'),
            update: mutation('update'),
            remove: mutation('remove'),
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
  h.resets.length = 0
  state.rev = 'rev-1'
  state.attached = [attachedRow('speakerCard')]
  state.fetching = false
  state.errors = {}
})
afterEach(cleanup)

const open = () =>
  render(<CampaignRecipesDialog campaignId="campaign" onClose={vi.fn()} />)

describe('attaching a Library Recipe', () => {
  it('sends the entry, the Library defaults and the revision the FORM opened on', () => {
    const { rerender } = open()
    fireEvent.click(
      screen.getByRole('button', { name: 'Attach Sponsor thank-you card' }),
    )
    // Somebody else's write lands while the form is open. The form holds what
    // the organizer typed against the revision it opened on, so the save must
    // go out against THAT one and lose the compare-and-set — sending the
    // fresh revision would overwrite the other write without anyone seeing.
    state.rev = 'rev-2'
    rerender(<CampaignRecipesDialog campaignId="campaign" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Attach Recipe' }))
    expect(h.attach).toHaveBeenCalledTimes(1)
    expect(h.attach).toHaveBeenCalledWith({
      campaignId: 'campaign',
      rev: 'rev-1',
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
    expect(
      screen.getByRole('list', {
        name: 'What needs fixing before this can be saved',
      }).textContent,
    ).toBe('LinkedIn copy: {recipient} cannot be filled in for this Recipe.')
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

describe('after a write', () => {
  it('says how many Tasks an attach created, refreshes everything that lists them, and returns to the list', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Attach Countdown' }))
    // The form is up before the write lands…
    expect(screen.getByRole('button', { name: 'Attach Recipe' })).toBeVisible()
    act(() =>
      h.handlers.attach?.onSuccess?.({
        created: 1,
        ceilingWarnings: [],
      } as never),
    )
    expect(h.notify).toHaveBeenCalledWith({
      type: 'success',
      title: 'Recipe attached · 1 Task created',
    })
    // …and the list is back after it.
    expect(screen.queryByRole('button', { name: 'Attach Recipe' })).toBeNull()
    expect(screen.getByText('On this Campaign')).toBeInTheDocument()
    expect([...h.invalidated].sort()).toEqual([
      'campaign',
      'plan',
      'report',
      'social',
    ])
  })
  it('keeps the rows shut until the refetch lands: a form opened on the old revision could only conflict', () => {
    state.fetching = true
    open()
    for (const name of [
      'Edit Speaker card',
      'Remove Speaker card',
      'Attach Countdown',
    ])
      expect(screen.getByRole('button', { name })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Speaker card' }))
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(screen.getByText('On this Campaign')).toBeInTheDocument()
  })
  it('shows a failed removal on the list, not behind the confirmation', () => {
    state.errors = { remove: 'The Campaign changed. Reload and try again.' }
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Speaker card' }))
    act(() => h.handlers.remove?.onError?.())
    expect(screen.getByRole('alert').textContent).toContain(
      'The Campaign changed. Reload and try again.',
    )
    expect(
      screen.getByRole('button', { name: 'Remove Speaker card' }),
    ).toBeInTheDocument()
  })
})

describe('leaving a form', () => {
  it('Cancel returns to the list, refetches the Campaign and clears every old error — a removal’s too', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Speaker card' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('On this Campaign')).toBeInTheDocument()
    expect(h.refetch).toHaveBeenCalledTimes(1)
    expect([...h.resets].sort()).toEqual(['attach', 'remove', 'update'])
  })
  it('Reload after a conflict does the same, so the reopened form shows what is stored now', () => {
    state.errors = { update: 'The Campaign changed. Reload and try again.' }
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Speaker card' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reload the Campaign' }))
    expect(screen.getByText('On this Campaign')).toBeInTheDocument()
    expect(h.refetch).toHaveBeenCalledTimes(1)
    expect([...h.resets].sort()).toEqual(['attach', 'remove', 'update'])
  })
})

describe('the countdown form', () => {
  it('sets its window in days before the conference, with no Milestone to choose, and at most one post a day', () => {
    state.attached = []
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Attach Countdown' }))
    expect(screen.queryByLabelText('Milestone')).toBeNull()
    expect(screen.getByLabelText('First post, days before')).toHaveValue(30)
    expect(screen.getByLabelText('Bluesky posts per week')).toHaveAttribute(
      'max',
      '7',
    )
    fireEvent.change(screen.getByLabelText('First post, days before'), {
      target: { value: '14' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Attach Recipe' }))
    expect(h.attach.mock.calls[0][0].edits.window).toEqual({
      from: { milestone: 'CONFERENCE_START', offsetDays: -14 },
      to: { milestone: 'CONFERENCE_START', offsetDays: -1 },
    })
  })
})
