/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReviewItem } from '@/lib/marketing/plan-templates'
import { formatDateSafe } from '@/lib/time'

const UNANCHORED: ReviewItem = {
  taskId: 'marketingTask.a',
  title: 'Venue photo post',
  campaignTitle: 'Final push',
  type: 'anchor',
  anchor: { milestone: 'CONFERENCE_START', offsetDays: -7 },
  date: '2026-11-05',
}
const LITERAL: ReviewItem = {
  taskId: 'marketingTask.b',
  title: 'Early-bird reminder',
  campaignTitle: 'Early bird',
  type: 'copy',
  text: 'Early bird ends 12 November 2026',
}

const h = vi.hoisted(() => ({
  save: vi.fn(),
  notify: vi.fn(),
  invalidated: [] as string[],
  onSuccess: undefined as ((result: { version: number }) => void) | undefined,
}))
const state = {
  review: [] as ReviewItem[],
  templates: [] as {
    templateId: string
    name: string
    latestVersion: number
  }[],
  unsavedTargets: [] as { campaignTitle: string; target: number }[],
  refreshing: false,
}
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.notify }),
}))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      marketing: {
        template: {
          invalidate: () => {
            h.invalidated.push('template')
          },
        },
      },
    }),
    marketing: {
      template: {
        savePreview: {
          useQuery: () => ({
            data: {
              review: state.review,
              templates: state.templates,
              unsavedTargets: state.unsavedTargets,
            },
            isPending: false,
            isFetching: state.refreshing,
            error: null,
          }),
        },
        save: {
          useMutation: (options: {
            onSuccess: (result: { version: number }) => void
          }) => {
            h.onSuccess = options.onSuccess
            return { mutate: h.save, isPending: false, error: null }
          },
        },
      },
    },
  },
}))
const { SaveAsTemplateDialog } = await import('./SaveAsTemplateDialog')

beforeEach(() => {
  vi.clearAllMocks()
  h.invalidated.length = 0
  state.review = [UNANCHORED, LITERAL]
  state.templates = [
    { templateId: 'template-1', name: 'Bergen playbook', latestVersion: 3 },
  ]
  state.unsavedTargets = []
  state.refreshing = false
})
afterEach(cleanup)

const open = (onClose = vi.fn()) => {
  render(<SaveAsTemplateDialog onClose={onClose} />)
  return onClose
}
const saveButton = () =>
  screen.getByRole('button', { name: 'Save as Template' })

describe('choosing where the Template goes', () => {
  it('sends a NEW Template under the typed name, with no decisions when nothing was touched', () => {
    open()
    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: '  Bergen 2027  ' },
    })
    fireEvent.click(saveButton())
    expect(h.save).toHaveBeenCalledTimes(1)
    expect(h.save).toHaveBeenCalledWith({
      target: { type: 'new', name: 'Bergen 2027' },
      decisions: {},
    })
  })

  it('sends a new VERSION of the selected Template and says which it will be', () => {
    state.templates = [
      { templateId: 'template-1', name: 'Bergen playbook', latestVersion: 3 },
      { templateId: 'template-2', name: 'Oslo playbook', latestVersion: 1 },
    ]
    open()
    fireEvent.click(screen.getByRole('radio', { name: 'New version of…' }))
    expect(
      screen.getByRole('option', {
        name: 'Oslo playbook — will become version 2',
      }),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Template'), {
      target: { value: 'template-2' },
    })
    fireEvent.click(saveButton())
    expect(h.save).toHaveBeenCalledWith({
      target: { type: 'version', templateId: 'template-2' },
      decisions: {},
    })
  })

  it('does not offer a version when the organization owns no Template', () => {
    state.templates = []
    open()
    expect(screen.queryByRole('radio', { name: 'New version of…' })).toBe(null)
  })

  it('refuses to save a new Template with no name', () => {
    open()
    expect(saveButton()).toBeDisabled()
    fireEvent.click(saveButton())
    expect(h.save).not.toHaveBeenCalled()
  })
})

describe('the review list', () => {
  it('sends only the anchors and copy that were CHANGED', () => {
    open()
    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'Bergen 2027' },
    })
    // Confirmed as derived: the offset is re-typed to the same number, and the
    // Milestone is left alone.
    fireEvent.change(screen.getByLabelText('Days from Milestone'), {
      target: { value: '-7' },
    })
    fireEvent.change(screen.getByLabelText('Copy for Early-bird reminder'), {
      target: { value: 'Early bird ends {date}' },
    })
    fireEvent.click(saveButton())
    expect(h.save).toHaveBeenCalledWith({
      target: { type: 'new', name: 'Bergen 2027' },
      decisions: { copy: { 'marketingTask.b': 'Early bird ends {date}' } },
    })
  })

  it('sends a changed anchor under the Task it belongs to', () => {
    open()
    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'Bergen 2027' },
    })
    fireEvent.change(screen.getByLabelText('Milestone'), {
      target: { value: 'EARLY_BIRD_END' },
    })
    fireEvent.change(screen.getByLabelText('Days from Milestone'), {
      target: { value: '-3' },
    })
    fireEvent.click(saveButton())
    expect(h.save.mock.calls[0][0].decisions).toEqual({
      anchors: {
        'marketingTask.a': { milestone: 'EARLY_BIRD_END', offsetDays: -3 },
      },
    })
  })

  it('blocks Save on a placeholder a static Task can never fill in', () => {
    open()
    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'Bergen 2027' },
    })
    fireEvent.change(screen.getByLabelText('Copy for Early-bird reminder'), {
      target: { value: 'Hi {name}, early bird ends {date}' },
    })
    expect(screen.getByRole('alert').textContent).toBe(
      '{name} cannot be filled in for a Task like this one.',
    )
    expect(saveButton()).toBeDisabled()
    fireEvent.click(saveButton())
    expect(h.save).not.toHaveBeenCalled()
  })

  it('says so when nothing needs a decision', () => {
    state.review = []
    open()
    expect(screen.getByText(/Nothing needs a decision\./)).toBeInTheDocument()
    expect(screen.queryByText('Unanchored Tasks')).toBe(null)
    expect(screen.queryByText('Tasks carrying literal copy')).toBe(null)
  })

  it('shows the Task, its Campaign and the date it sits on now', () => {
    open()
    expect(screen.getAllByText('Venue photo post')).toHaveLength(1)
    expect(screen.getByText('Final push')).toBeInTheDocument()
    expect(
      screen.getByText(`Now on ${formatDateSafe('2026-11-05')}`),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Copy for Early-bird reminder')).toHaveValue(
      'Early bird ends 12 November 2026',
    )
  })

  it('states that saving never changes the plan', () => {
    open()
    expect(
      screen.getByText(/Saving never changes this plan\./),
    ).toBeInTheDocument()
  })
})

describe('what the dialog will not let through', () => {
  it('waits for the forced refresh: the list on screen may be the PREVIOUS plan’s, and a version is immutable', () => {
    state.refreshing = true
    const { rerender } = render(<SaveAsTemplateDialog onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'Ours' },
    })
    expect(saveButton()).toBeDisabled()
    expect(
      screen.getByText(/Checking the plan for changes/),
    ).toBeInTheDocument()
    fireEvent.click(saveButton())
    expect(h.save).not.toHaveBeenCalled()
    state.refreshing = false
    rerender(<SaveAsTemplateDialog onClose={vi.fn()} />)
    expect(saveButton()).toBeEnabled()
  })
  it('names the Targets it cannot save when the edition has no ticket capacity', () => {
    state.unsavedTargets = [
      { campaignTitle: 'Early bird', target: 120 },
      { campaignTitle: 'CFP', target: 80 },
    ]
    open()
    expect(
      screen.getByText('These Targets will not be saved'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/save without Early bird \(120\), CFP \(80\)/),
    ).toBeInTheDocument()
  })
})

describe('after a successful save', () => {
  it('names the version in the toast, invalidates the Templates and closes', () => {
    const onClose = open()
    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'Bergen 2027' },
    })
    fireEvent.click(saveButton())
    h.onSuccess?.({ version: 1 })
    expect(h.notify).toHaveBeenCalledWith({
      type: 'success',
      title: 'Saved “Bergen 2027” as version 1',
    })
    expect(h.invalidated).toEqual(['template'])
    expect(onClose).toHaveBeenCalled()
  })
})
