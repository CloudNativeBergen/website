/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BUILTIN_TEMPLATE_VERSION } from '@/lib/marketing/template'
import type {
  TemplatePreview,
  TemplateSummary,
  TemplateVersionRow,
} from './templates'

const TEMPLATES: TemplateSummary[] = [
  {
    templateId: 'template-1',
    name: 'Bergen playbook',
    latestVersion: 3,
    campaigns: 6,
    savedAt: '2026-06-17T10:00:00Z',
  },
]
const VERSIONS: TemplateVersionRow[] = [
  {
    version: 3,
    savedAt: '2026-06-17T10:00:00Z',
    savedByName: 'Ada Organizer',
    savedFromTitle: 'CNDN 2026',
    restoredFrom: null,
  },
  {
    version: 2,
    savedAt: '2025-06-17T10:00:00Z',
    savedByName: 'Ada Organizer',
    savedFromTitle: 'CNDN 2025',
    restoredFrom: null,
  },
]
/** Version 2 carries two optional Campaigns; version 3 dropped one of them. */
const previewOf = (version: number): TemplatePreview => ({
  name: 'Bergen playbook',
  version,
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
    {
      key: 'keynotes',
      title: 'Keynotes',
      optional: true,
      start: { milestone: 'SPEAKERS_ANNOUNCED', offsetDays: -28 },
      end: { milestone: 'SPEAKERS_ANNOUNCED', offsetDays: 0 },
      primaryOutcome: 'ticketsSoldInWindow',
      tasks: 4,
      recipes: [],
    },
    ...(version === 2
      ? [
          {
            key: 'workshops',
            title: 'Workshops',
            optional: true,
            start: { milestone: 'TICKETS_OPEN' as const, offsetDays: 0 },
            end: { milestone: 'CONFERENCE_START' as const, offsetDays: -1 },
            primaryOutcome: 'ticketsSoldInWindow' as const,
            tasks: 3,
            recipes: [],
          },
        ]
      : []),
  ],
})

const h = vi.hoisted(() => ({ create: vi.fn(), copy: vi.fn() }))
const state = { templates: [] as TemplateSummary[], previewLoaded: true }
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))
vi.mock('@/lib/trpc/client', () => {
  const mutation = (mutate: typeof h.create) => ({
    useMutation: () => ({ mutate, isPending: false, error: null }),
  })
  return {
    api: {
      useUtils: () => ({
        marketing: { plan: { get: { invalidate: vi.fn() } } },
      }),
      marketing: {
        plan: {
          copySources: {
            useQuery: () => ({ data: [], isPending: false, error: null }),
          },
          create: mutation(h.create),
          copy: mutation(h.copy),
        },
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
            useQuery: (input: { version: number }) => ({
              data: state.previewLoaded ? previewOf(input.version) : undefined,
              isPending: !state.previewLoaded,
              error: null,
            }),
          },
        },
      },
    },
  }
})
const { CreatePlanDialog } = await import('./CreatePlanDialog')

beforeEach(() => {
  vi.clearAllMocks()
  state.previewLoaded = true
  state.templates = TEMPLATES
})
afterEach(cleanup)

const open = () => render(<CreatePlanDialog isOpen onClose={vi.fn()} />)
const createButton = () => screen.getByRole('button', { name: 'Create plan' })

describe('the organization Template source', () => {
  it('is not offered when the organization owns no Template', () => {
    state.templates = []
    open()
    expect(
      screen.queryByRole('radio', { name: /An organization Template/ }),
    ).toBe(null)
    expect(screen.getByText(/owns no Templates yet/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Manage Templates' }),
    ).toHaveAttribute('href', '/admin/marketing/templates')
  })

  it('creates from the LATEST version with every optional Campaign', () => {
    open()
    fireEvent.click(
      screen.getByRole('radio', { name: /An organization Template/ }),
    )
    expect(screen.getByLabelText('Version')).toHaveValue('3')
    expect(screen.getByRole('checkbox', { name: 'Keynotes' })).toBeChecked()
    fireEvent.click(createButton())
    expect(h.create).toHaveBeenCalledWith({
      source: {
        type: 'template',
        templateId: 'template-1',
        version: 3,
        includeOptional: ['keynotes'],
      },
    })
  })

  it('waits for the preview: creating without it would silently leave every optional Campaign out', () => {
    state.previewLoaded = false
    const { rerender } = open()
    fireEvent.click(
      screen.getByRole('radio', { name: /An organization Template/ }),
    )
    expect(createButton()).toBeDisabled()
    fireEvent.click(createButton())
    expect(h.create).not.toHaveBeenCalled()
    state.previewLoaded = true
    rerender(<CreatePlanDialog isOpen onClose={vi.fn()} />)
    expect(createButton()).toBeEnabled()
    fireEvent.click(createButton())
    expect(h.create.mock.calls[0][0].source.includeOptional).toEqual([
      'keynotes',
    ])
  })
  it('creates from an OLDER version with one optional Campaign unticked', () => {
    open()
    fireEvent.click(
      screen.getByRole('radio', { name: /An organization Template/ }),
    )
    fireEvent.change(screen.getByLabelText('Version'), {
      target: { value: '2' },
    })
    // The older version's own Campaigns are previewed, and the one it adds is
    // offered in the optional checklist.
    expect(screen.getAllByText('Workshops')).toHaveLength(2)
    expect(screen.getByRole('checkbox', { name: 'Workshops' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keynotes' }))
    fireEvent.click(createButton())
    expect(h.create).toHaveBeenCalledWith({
      source: {
        type: 'template',
        templateId: 'template-1',
        version: 2,
        includeOptional: ['workshops'],
      },
    })
  })

  it('previews the version: window in words, Task count and Recipes', () => {
    open()
    fireEvent.click(
      screen.getByRole('radio', { name: /An organization Template/ }),
    )
    expect(
      screen.getByText(/CFP opens → CFP closes \+1 d · 9 tasks/),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Plus what its Recipes create: Speaker card'),
    ).toBeInTheDocument()
  })
})

describe('the sources that already existed', () => {
  it('still creates from the built-in Template, version pinned to this build', () => {
    open()
    fireEvent.click(createButton())
    expect(h.create).toHaveBeenCalledWith({
      source: {
        type: 'builtin',
        templateVersion: BUILTIN_TEMPLATE_VERSION,
        includeOptional: expect.any(Array),
      },
    })
  })

  it('still creates a blank plan', () => {
    open()
    fireEvent.click(screen.getByRole('radio', { name: /^Blank/ }))
    fireEvent.click(createButton())
    expect(h.create).toHaveBeenCalledWith({ source: { type: 'blank' } })
  })
})
