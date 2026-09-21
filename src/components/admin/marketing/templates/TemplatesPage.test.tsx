/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {
  TemplatePreview,
  TemplateSummary,
  TemplateVersionRow,
} from './template-model'

const TEMPLATE: TemplateSummary = {
  templateId: 'template-1',
  name: 'Bergen playbook',
  latestVersion: 3,
  campaigns: 6,
  savedAt: '2026-06-17T10:00:00Z',
}
const VERSIONS: TemplateVersionRow[] = [
  {
    version: 3,
    savedAt: '2026-06-17T10:00:00Z',
    savedByName: 'Ada Organizer',
    savedFromTitle: 'Cloud Native Days Norway 2026',
    restoredFrom: 1,
  },
  {
    version: 1,
    savedAt: '2025-06-17T10:00:00Z',
    savedByName: 'Ada Organizer',
    savedFromTitle: 'Cloud Native Days Norway 2025',
    restoredFrom: null,
  },
]
const PREVIEW: TemplatePreview = {
  name: 'Bergen playbook',
  version: 3,
  campaigns: [
    {
      key: 'cfp',
      title: 'Call for papers',
      optional: false,
      start: { milestone: 'CFP_OPEN', offsetDays: 0 },
      end: { milestone: 'CFP_CLOSE', offsetDays: 1 },
      primaryOutcome: 'cfpSubmissions',
      tasks: 9,
      recipes: ['Speaker card'],
    },
  ],
}

const h = vi.hoisted(() => ({
  restore: vi.fn(),
  restoreFailed: undefined as undefined | (() => void),
  rename: vi.fn(),
  remove: vi.fn(),
  notify: vi.fn(),
  previewInputs: [] as { templateId: string; version: number }[],
}))
const state = {
  templates: [] as TemplateSummary[],
  restoreError: null as string | null,
}
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.notify }),
}))
vi.mock('@/lib/trpc/client', () => {
  const mutation = (mutate: typeof h.restore) => ({
    useMutation: (options?: { onError?: () => void }) => {
      if (mutate === h.restore) h.restoreFailed = options?.onError
      return {
        mutate,
        isPending: false,
        error:
          mutate === h.restore && state.restoreError
            ? { message: state.restoreError }
            : null,
      }
    },
  })
  return {
    api: {
      useUtils: () => ({ marketing: { template: { invalidate: vi.fn() } } }),
      marketing: {
        template: {
          list: {
            useQuery: () => ({
              data: state.templates,
              isPending: false,
              error: null,
            }),
          },
          versions: {
            useQuery: () => ({
              data: VERSIONS,
              isPending: false,
              error: null,
            }),
          },
          preview: {
            useQuery: (input: { templateId: string; version: number }) => {
              h.previewInputs.push(input)
              return {
                data: { ...PREVIEW, version: input.version },
                isPending: false,
                error: null,
              }
            },
          },
          restore: mutation(h.restore),
          rename: mutation(h.rename),
          delete: mutation(h.remove),
        },
      },
    },
  }
})
const { TemplatesPage } = await import('./TemplatesPage')

beforeEach(() => {
  vi.clearAllMocks()
  h.previewInputs.length = 0
  state.templates = [TEMPLATE]
})
afterEach(cleanup)

describe('the Templates page', () => {
  it('explains where a Template comes from when there is none', () => {
    state.templates = []
    render(<TemplatesPage />)
    expect(screen.getByText('No Templates yet.')).toBeInTheDocument()
    expect(
      screen.getByText(/Save as Template.* on plan settings/),
    ).toBeInTheDocument()
    expect(screen.getByText('Go to plan settings')).toHaveAttribute(
      'href',
      '/admin/marketing/settings',
    )
  })

  it('opens the latest version, with its provenance and preview', () => {
    render(<TemplatesPage />)
    expect(screen.getByText('Version 3 · latest')).toBeInTheDocument()
    expect(
      screen.getByText(/Ada Organizer · from Cloud Native Days Norway 2026/),
    ).toBeInTheDocument()
    expect(screen.getByText(/restored from v1/)).toBeInTheDocument()
    expect(h.previewInputs.at(-1)).toEqual({
      templateId: 'template-1',
      version: 3,
    })
    expect(screen.getByText('Call for papers')).toBeInTheDocument()
    expect(
      screen.getByText(/CFP opens → CFP closes \+1 d · 9 tasks to start with/),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Plus what its Recipes create: Speaker card'),
    ).toBeInTheDocument()
  })

  it('previews an older version when it is selected', () => {
    render(<TemplatesPage />)
    fireEvent.click(screen.getByText('Version 1').closest('button')!)
    expect(h.previewInputs.at(-1)).toEqual({
      templateId: 'template-1',
      version: 1,
    })
  })

  it('offers Restore on an older version only, and confirms before writing', () => {
    render(<TemplatesPage />)
    expect(screen.queryByRole('button', { name: 'Restore version 3' })).toBe(
      null,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Restore version 1' }))
    expect(h.restore).not.toHaveBeenCalled()
    expect(
      screen.getByText(/Restoring writes a NEW version/),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore version' }))
    expect(h.restore).toHaveBeenCalledWith({
      templateId: 'template-1',
      version: 1,
    })
  })

  it('shows a failed restore on the page, not behind the confirmation', async () => {
    state.restoreError =
      'Someone else just saved this Template. Reload and save again.'
    render(<TemplatesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Restore version 1' }))
    expect(
      screen.getByText(/Restoring writes a NEW version/),
    ).toBeInTheDocument()
    act(() => h.restoreFailed?.())
    // The confirmation closes (after its leave transition), so the alert on
    // the page is no longer behind an overlay.
    await waitFor(() =>
      expect(screen.queryByText(/Restoring writes a NEW version/)).toBeNull(),
    )
    expect(screen.getByRole('alert').textContent).toBe(
      'Someone else just saved this Template. Reload and save again.',
    )
    state.restoreError = null
  })

  it('renames the Template under its id', () => {
    render(<TemplatesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: '  Bergen 2027 playbook  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rename Template' }))
    expect(h.rename).toHaveBeenCalledWith({
      templateId: 'template-1',
      name: 'Bergen 2027 playbook',
    })
  })

  it('names the Template and requires it typed before deleting', () => {
    render(<TemplatesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(
      screen.getByText('Delete the Template “Bergen playbook”?'),
    ).toBeInTheDocument()
    expect(screen.getByText(/keep their stamped origin/)).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: 'Delete Template' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Type .* to confirm/), {
      target: { value: 'Bergen playbok' },
    })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Type .* to confirm/), {
      target: { value: 'Bergen playbook' },
    })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    expect(h.remove).toHaveBeenCalledWith({
      templateId: 'template-1',
      confirmName: 'Bergen playbook',
    })
  })
})
