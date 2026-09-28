// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import type { TaskEditorData } from '@/lib/marketing/types'
import { OWN_PAGES } from '@/lib/marketing/pages'
import { TaskEditorPage } from './TaskEditorPage'

const mocks = vi.hoisted(() => ({
  galleryList: vi.fn(),
  galleryFilters: vi.fn(),
  data: null as TaskEditorData | null,
  fetch: vi.fn(),
  attach: vi.fn(),
  invalidate: vi.fn(),
  notify: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
  query: vi.fn(),
  editorQuery: vi.fn(() => ({ data: undefined, error: null })),
  fetchEditor: vi.fn(),
  deletionPreview: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: mocks.notify }),
}))
vi.mock('@/lib/trpc/client', () => {
  const mutation = {
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  }
  return {
    api: {
      useUtils: () => ({
        marketing: {
          task: { get: { fetch: mocks.fetch, invalidate: mocks.invalidate } },
          plan: { get: { invalidate: mocks.invalidate } },
        },
        marketingAsset: {
          list: { invalidate: mocks.galleryList },
          filters: { invalidate: mocks.galleryFilters },
        },
      }),
      marketing: {
        task: {
          get: { useQuery: mocks.query },
          attachAsset: { useMutation: () => ({ mutateAsync: mocks.attach }) },
          deletionPreview: { useQuery: mocks.deletionPreview },
          delete: {
            useMutation: () => ({ mutate: mocks.remove, isPending: false }),
          },
          setAssignee: mutation,
          setDate: mutation,
          setPrerequisites: mutation,
          skip: mutation,
          approve: mutation,
          update: {
            useMutation: (options: { onSuccess: () => void }) => ({
              mutate: (input: unknown) => mocks.update(input, options),
              isPending: false,
            }),
          },
          sendOutreach: {
            useMutation: (options: { onSuccess: () => void }) => ({
              mutate: (input: unknown) => mocks.send(input, options),
              isPending: false,
            }),
          },
        },
      },
      social: {
        getVariantEditor: { useQuery: mocks.editorQuery },
        unscheduleVariant: mutation,
        scheduleVariant: mutation,
        markPosted: mutation,
      },
    },
  }
})

function outreachData(): TaskEditorData {
  const data = pendingData()
  return {
    ...data,
    task: {
      ...data.task,
      _id: 'outreach-1',
      kind: 'speakerOutreach',
      // Explicit: this Kind completes on `messageId`, which is null here. Do not
      // inherit the render fixture's completion, which comes from its asset.
      complete: false,
      messageId: null,
      handoffPending: false,
      targetPage: '/tickets',
      shortCode: null,
      subject: { _id: 'speaker-1', name: 'Ada', type: 'speaker', slug: 'ada' },
    },
    pages: [...OWN_PAGES],
    taggedLink: 'https://example.test/tickets?utm_source=outreach',
    outreachBody:
      'Hi Ada, share https://example.test/tickets?utm_source=outreach',
  }
}

// Exercise actual cache invalidation/refetching. Only the server response is
// mocked: refreshed data must reach the editor through its query subscription.
function renderOutreachWithQuery(retry: number | false = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry, retryDelay: 0 } },
  })
  const queryKey = ['marketing.task.get', { taskId: 'outreach-1' }]
  client.setQueryData(queryKey, outreachData())
  mocks.query.mockImplementation(function useTaskQuery() {
    return useQuery({ queryKey, queryFn: () => mocks.fetch() })
  })
  mocks.invalidate.mockImplementation((input) =>
    input ? client.invalidateQueries({ queryKey }) : Promise.resolve(),
  )
  const page = render(
    <QueryClientProvider client={client}>
      <TaskEditorPage taskId="outreach-1" />
    </QueryClientProvider>,
  )
  return {
    client,
    queryKey,
    dispose: () => {
      page.unmount()
      client.clear()
    },
  }
}

/** §2.7: the Task delete preview warns about a link that may be live. */
describe('Task delete preview (#1145)', () => {
  beforeEach(() => {
    mocks.data = outreachData()
  })
  const open = () => {
    render(<TaskEditorPage taskId="outreach-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }))
  }
  const confirm = () =>
    screen.getAllByRole('button', { name: 'Delete task' }).at(-1)!

  it('reads the preview only once the dialog opens', () => {
    render(<TaskEditorPage taskId="outreach-1" />)
    expect(mocks.deletionPreview).toHaveBeenLastCalledWith(
      { taskId: 'outreach-1' },
      expect.objectContaining({ enabled: false }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }))
    expect(mocks.deletionPreview).toHaveBeenLastCalledWith(
      { taskId: 'outreach-1' },
      expect.objectContaining({ enabled: true, staleTime: 0 }),
    )
  })

  it('reads afresh on every open, despite the app-wide 60s staleTime', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 60_000 } },
    })
    const fetchPreview = vi.fn().mockResolvedValue({ liveLinks: 0 })
    mocks.deletionPreview.mockImplementation(
      (input: unknown, options: Record<string, unknown>) =>
        useQuery({
          queryKey: ['marketing.task.deletionPreview', input],
          queryFn: fetchPreview,
          ...options,
        }),
    )
    render(
      <QueryClientProvider client={client}>
        <TaskEditorPage taskId="outreach-1" />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }))
    await waitFor(() => expect(fetchPreview).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fetchPreview.mockResolvedValue({ liveLinks: 1 })
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete task' })[0])
    await waitFor(() => expect(fetchPreview).toHaveBeenCalledTimes(2))
    expect(
      await screen.findByText('1 short link may already be shared'),
    ).toBeTruthy()
    client.clear()
  })

  it('warns that the link falls back to the home page, and still deletes', () => {
    mocks.deletionPreview.mockReturnValue({
      data: { liveLinks: 1 },
      isFetching: false,
      error: null,
    })
    open()
    expect(screen.getByText('1 short link may already be shared')).toBeTruthy()
    expect(screen.getByText(/opens the conference home page/)).toBeTruthy()
    fireEvent.click(confirm())
    expect(mocks.remove).toHaveBeenCalledWith({ taskId: 'outreach-1' })
  })

  it('says nothing extra when no link may be live', () => {
    mocks.deletionPreview.mockReturnValue({
      data: { liveLinks: 0 },
      isFetching: false,
      error: null,
    })
    open()
    expect(screen.queryByText(/may already be shared/)).toBeNull()
    expect(screen.queryByText(/Checking/)).toBeNull()
    fireEvent.click(confirm())
    expect(mocks.remove).toHaveBeenCalledTimes(1)
  })

  it('waits for the preview before confirming', () => {
    mocks.deletionPreview.mockReturnValue({
      data: { liveLinks: 1 },
      isFetching: true,
      error: null,
    })
    open()
    expect(screen.getByText('Checking what the delete removes…')).toBeTruthy()
    fireEvent.click(confirm())
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('never blocks on a failed preview: the delete re-checks on the server', () => {
    mocks.deletionPreview.mockReturnValue({
      data: undefined,
      isFetching: false,
      error: { message: 'The post has been published; the record is kept.' },
    })
    open()
    expect(screen.getByRole('alert').textContent).toBe(
      'The post has been published; the record is kept.',
    )
    fireEvent.click(confirm())
    expect(mocks.remove).toHaveBeenCalledWith({ taskId: 'outreach-1' })
  })
})

describe('Task editor outreach', () => {
  beforeEach(() => {
    mocks.data = outreachData()
  })

  it('shows the short link, with the destination it expands to under it (short-links spec §2.7)', () => {
    mocks.data = {
      ...outreachData(),
      task: { ...outreachData().task, shortCode: 'abc987' },
      shortLinkOrigin: 'https://example.test',
    }
    render(<TaskEditorPage taskId="outreach-1" />)
    expect(screen.getByText('Short link')).toBeTruthy()
    expect(screen.getByTestId('tagged-link').textContent).toBe(
      'https://example.test/go/abc987',
    )
    expect(screen.getByTestId('link-destination').textContent).toBe(
      'https://example.test/tickets?utm_source=outreach',
    )
  })

  it('shows the tagged link alone for a Task without a code yet', () => {
    render(<TaskEditorPage taskId="outreach-1" />)
    expect(screen.getByText('Tagged link')).toBeTruthy()
    expect(screen.getByTestId('tagged-link').textContent).toBe(
      'https://example.test/tickets?utm_source=outreach',
    )
    expect(screen.queryByTestId('link-destination')).toBeNull()
  })

  it('preserves the edited draft after send and recovery refetch failures', async () => {
    mocks.fetch.mockRejectedValue(new Error('Recovery unavailable'))
    const { client, queryKey, dispose } = renderOutreachWithQuery(2)
    try {
      fireEvent.change(screen.getByLabelText('Message'), {
        target: { value: 'My carefully edited outreach draft' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
      act(() => mocks.send.mock.calls[0][1].onError(new Error('Send failed')))
      await waitFor(() =>
        expect(client.getQueryState(queryKey)).toMatchObject({
          status: 'error',
          fetchStatus: 'idle',
        }),
      )
      expect(mocks.fetch).toHaveBeenCalledTimes(3)
      const failedRecoveryDraft = (
        screen.queryByLabelText('Message') as HTMLTextAreaElement | null
      )?.value
      const recoveryNotice = screen.getByRole('alert').textContent

      // Recovery must not recreate the editor from its original template.
      mocks.fetch.mockResolvedValue(outreachData())
      await act(() => client.invalidateQueries({ queryKey }))
      expect(await screen.findByLabelText('Message')).toHaveProperty(
        'value',
        'My carefully edited outreach draft',
      )
      expect(failedRecoveryDraft).toBe('My carefully edited outreach draft')
      expect(recoveryNotice).toContain('could not confirm the Task')
      expect(
        screen.getByRole('button', { name: 'Send message' }),
      ).toHaveProperty('disabled', false)
    } finally {
      dispose()
    }
  })

  it('keeps Send unpressable while the recovery refetch is in flight', async () => {
    let resolveFetch!: (data: TaskEditorData) => void
    mocks.fetch.mockImplementation(
      () =>
        new Promise<TaskEditorData>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const { client, queryKey, dispose } = renderOutreachWithQuery()
    try {
      const send = screen.getByRole('button', { name: 'Send message' })
      expect(send).toHaveProperty('disabled', false)
      fireEvent.click(send)
      act(() => mocks.send.mock.calls[0][1].onError(new Error('Response lost')))
      await waitFor(() =>
        expect(client.getQueryState(queryKey)?.fetchStatus).toBe('fetching'),
      )
      // Flush the query observer notification before probing the button.
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
      expect(
        screen.getByRole('button', { name: 'Send message' }),
      ).toHaveProperty('disabled', true)
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
      expect(mocks.send).toHaveBeenCalledTimes(1)
      await act(async () => resolveFetch(outreachData()))
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Send message' }),
        ).toHaveProperty('disabled', false),
      )
    } finally {
      dispose()
    }
  })

  it('shows the error page when the initial load fails without cached data', () => {
    mocks.query.mockReturnValue({
      data: undefined,
      error: new Error('Initial load failed'),
      isFetching: false,
    })
    render(<TaskEditorPage taskId="outreach-1" />)
    expect(screen.getByRole('alert').textContent).toBe(
      'The Task cannot be shown.Initial load failed',
    )
  })

  it('recovers completion when a committed send response is lost', async () => {
    mocks.fetch.mockResolvedValue({
      ...outreachData(),
      task: {
        ...outreachData().task,
        _rev: 'r3',
        messageId: 'message-committed',
        status: 'done',
        complete: true,
      },
    })
    const { dispose } = renderOutreachWithQuery()
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
      act(() => mocks.send.mock.calls[0][1].onError(new Error('Response lost')))
      await waitFor(() => {
        const send = screen.queryByRole('button', { name: 'Send message' })
        // A still-enabled Send is the defect, even if a toast was displayed.
        expect(send === null || (send as HTMLButtonElement).disabled).toBe(true)
        expect(screen.getByRole('status').textContent).toBe(
          'Message sent to Ada. This task is complete.',
        )
      })
    } finally {
      dispose()
    }
  })

  it('refetches a conflicting revision so Reset sends the current template and revision', async () => {
    mocks.fetch.mockResolvedValue({
      ...outreachData(),
      task: { ...outreachData().task, _rev: 'r3' },
      outreachBody: 'The latest template',
    })
    const { dispose } = renderOutreachWithQuery()
    try {
      fireEvent.change(screen.getByLabelText('Message'), {
        target: { value: 'Keep these edits' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
      act(() =>
        mocks.send.mock.calls[0][1].onError(new Error('Revision conflict')),
      )
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Send message' }),
        ).toHaveProperty('disabled', true),
      )
      expect(screen.getByLabelText('Message')).toHaveProperty(
        'value',
        'Keep these edits',
      )
      fireEvent.click(screen.getByRole('button', { name: 'Reset to template' }))
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
      expect(mocks.send).toHaveBeenLastCalledWith(
        { taskId: 'outreach-1', rev: 'r3', body: 'The latest template' },
        expect.any(Object),
      )
    } finally {
      dispose()
    }
  })

  it('recovers a destination edit when the task revision changes', () => {
    const page = render(<TaskEditorPage taskId="outreach-1" />)
    fireEvent.change(screen.getByLabelText('Target page'), {
      target: { value: 'cfp' },
    })
    mocks.data = {
      ...outreachData(),
      task: { ...outreachData().task, _rev: 'r3' },
    }
    page.rerender(<TaskEditorPage taskId="outreach-1" />)
    expect(
      screen.getByRole('button', { name: 'Save destination' }),
    ).toHaveProperty('disabled', true)
    expect(screen.getByRole('alert').textContent).toContain(
      'This task changed while you were choosing a destination.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset destination' }))
    expect(screen.getByLabelText('Target page')).toHaveProperty(
      'value',
      'tickets',
    )
    fireEvent.change(screen.getByLabelText('Target page'), {
      target: { value: 'cfp' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save destination' }))
    expect(mocks.update).toHaveBeenCalledWith(
      { taskId: 'outreach-1', rev: 'r3', targetPage: '/cfp' },
      expect.any(Object),
    )
  })

  it('sends the edited body and stays complete before the refetch arrives', () => {
    render(<TaskEditorPage taskId="outreach-1" />)
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'My edited message' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(mocks.send).toHaveBeenCalledWith(
      { taskId: 'outreach-1', rev: 'r2', body: 'My edited message' },
      expect.any(Object),
    )
    act(() => mocks.send.mock.calls[0][1].onSuccess())
    expect(screen.getByRole('status').textContent).toBe(
      'Message sent to Ada. This task is complete.',
    )
  })

  it('waits for the refreshed destination before sending the new template', () => {
    const page = render(<TaskEditorPage taskId="outreach-1" />)
    fireEvent.change(screen.getByLabelText('Target page'), {
      target: { value: 'cfp' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save destination' }))
    act(() => mocks.update.mock.calls[0][1].onSuccess())
    expect(screen.getByRole('button', { name: 'Send message' })).toHaveProperty(
      'disabled',
      true,
    )
    const body = 'Hi Ada, share https://example.test/cfp?utm_source=outreach'
    mocks.data = {
      ...outreachData(),
      task: { ...outreachData().task, _rev: 'r3', targetPage: '/cfp' },
      outreachBody: body,
      taggedLink: 'https://example.test/cfp?utm_source=outreach',
    }
    page.rerender(<TaskEditorPage taskId="outreach-1" />)
    expect(screen.getByLabelText('Message')).toHaveProperty('value', body)
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(mocks.send).toHaveBeenCalledWith(
      { taskId: 'outreach-1', rev: 'r3', body },
      expect.any(Object),
    )
  })

  it('preserves a stale message draft and resets to the current template', () => {
    const page = render(<TaskEditorPage taskId="outreach-1" />)
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Keep these edits' },
    })
    mocks.data = {
      ...outreachData(),
      task: { ...outreachData().task, _rev: 'r3' },
      outreachBody: 'The latest template',
    }
    page.rerender(<TaskEditorPage taskId="outreach-1" />)
    expect(screen.getByLabelText('Message')).toHaveProperty(
      'value',
      'Keep these edits',
    )
    expect(screen.getByRole('button', { name: 'Send message' })).toHaveProperty(
      'disabled',
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset to template' }))
    expect(screen.getByLabelText('Message')).toHaveProperty(
      'value',
      'The latest template',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(mocks.send).toHaveBeenCalledWith(
      { taskId: 'outreach-1', rev: 'r3', body: 'The latest template' },
      expect.any(Object),
    )
  })
})

function pendingData(): TaskEditorData {
  return {
    task: {
      _id: 'render-1',
      _rev: 'r2',
      campaignId: 'campaign-1',
      key: 'render',
      shortCode: null,
      title: 'Render the CFP card',
      kind: 'studioRender',
      channel: null,
      date: null,
      provisional: false,
      milestone: null,
      status: 'open',
      complete: true,
      prerequisiteIds: [],
      variantId: null,
      assigneeId: null,
      approvedAt: null,
      approvedByName: null,
      assigneeName: null,
      targetPage: null,
      instructions: null,
      verbatimCopy: false,
      externalUrl: null,
      skipReason: null,
      subject: null,
      assetUrl: '/saved-render.png',
      assetId: 'image-saved',
      handoffPending: true,
      origin: 'manual',
      messageId: null,
    },
    campaign: { _id: 'campaign-1', key: 'cfp', title: 'CFP' },
    planOwnerId: null,
    siblings: [],
    variant: null,
    baseUrl: 'https://example.test',
    shortLinkOrigin: null,
    taggedLink: null,
    pages: [],
    organizers: [],
    tagByHand: [],
    tagPeople: [],
    tagMentions: [],
    outreachBody: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.query.mockImplementation(() => ({
    data: mocks.data,
    isFetching: false,
  }))
  mocks.invalidate.mockReset()
  mocks.deletionPreview.mockReturnValue({
    data: undefined,
    isFetching: false,
    error: null,
  })
  mocks.data = pendingData()
  mocks.fetch.mockResolvedValue({
    ...mocks.data,
    task: { ...mocks.data.task, _rev: 'r3', assetId: 'image-latest' },
  })
  mocks.attach.mockResolvedValue({ success: true, handoffFailures: [] })
})
afterEach(cleanup)

describe('Task editor handoff recovery', () => {
  it('recovers server-side pending handoff after a reload using the latest revision and saved asset', async () => {
    const first = render(<TaskEditorPage taskId="render-1" />)
    first.unmount()
    mocks.data = structuredClone(pendingData())
    const reloaded = render(<TaskEditorPage taskId="render-1" />)

    expect(reloaded.container.textContent).toContain(
      'The render is done and saved. The image has not reached all publishing Tasks listed below yet.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry handoff' }))
    await waitFor(() =>
      expect(mocks.attach).toHaveBeenCalledWith({
        taskId: 'render-1',
        taskRev: 'r3',
        assetId: 'image-latest',
      }),
    )
    expect(mocks.fetch).toHaveBeenCalledWith(
      { taskId: 'render-1' },
      { staleTime: 0 },
    )
    mocks.data = {
      ...pendingData(),
      task: { ...pendingData().task, handoffPending: false },
    }
    reloaded.rerender(<TaskEditorPage taskId="render-1" />)
    expect((await screen.findByRole('status')).textContent).toBe(
      'Image handoff completed.',
    )
    expect(mocks.invalidate).toHaveBeenCalledWith({ taskId: 'render-1' })
  })

  it('a gallery-only retry says the render reached the gallery, not a handoff (#1165)', async () => {
    mocks.data = {
      ...pendingData(),
      task: {
        ...pendingData().task,
        handoffPending: false,
        galleryPending: true,
      },
    }
    mocks.attach.mockResolvedValue({
      success: true,
      handoffFailures: [],
      gallerySaved: true,
    })
    const page = render(<TaskEditorPage taskId="render-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Save to the gallery' }))
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled())
    mocks.data = {
      ...mocks.data,
      task: { ...mocks.data.task, galleryPending: false },
    }
    page.rerender(<TaskEditorPage taskId="render-1" />)
    expect((await screen.findByRole('status')).textContent).toBe(
      'The render is saved to the asset gallery.',
    ) // The gallery's lists show it now, not after their cache goes stale.
    expect(mocks.galleryList).toHaveBeenCalled()
    expect(mocks.galleryFilters).toHaveBeenCalled()
  })

  it('never claims the gallery when the answer did not save to it', async () => {
    mocks.data = {
      ...pendingData(),
      task: {
        ...pendingData().task,
        handoffPending: false,
        galleryPending: true,
      },
    }
    // Another tab's retry saved it first, and the organizer then deleted
    // the entry: this answer skips the gallery.
    mocks.attach.mockResolvedValue({ success: true, handoffFailures: [] })
    const page = render(<TaskEditorPage taskId="render-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Save to the gallery' }))
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled())
    mocks.data = {
      ...mocks.data,
      task: { ...mocks.data.task, galleryPending: false },
    }
    page.rerender(<TaskEditorPage taskId="render-1" />)
    expect((await screen.findByRole('status')).textContent).toBe(
      'The render is attached to this Task.',
    )
  })

  it('refreshes the gallery lists after a retry that reports a gallery failure too', async () => {
    mocks.data = {
      ...pendingData(),
      task: {
        ...pendingData().task,
        handoffPending: false,
        galleryPending: true,
      },
    }
    mocks.attach.mockResolvedValue({
      success: true,
      handoffFailures: [],
      galleryFailed: true,
    })
    render(<TaskEditorPage taskId="render-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Save to the gallery' }))
    await waitFor(() => expect(mocks.galleryList).toHaveBeenCalled())
    expect(mocks.galleryFilters).toHaveBeenCalled()
  })

  it('bypasses a fresh cached revision when retrying the saved handoff', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 60_000, retry: false } },
    })
    const queryKey = ['marketing.task.get', 'render-1']
    client.setQueryData(queryKey, pendingData())
    const current = {
      ...pendingData(),
      task: { ...pendingData().task, _rev: 'r3' },
    }
    mocks.fetch.mockImplementation((_input, options) =>
      client.fetchQuery({ queryKey, queryFn: async () => current, ...options }),
    )
    mocks.attach.mockImplementation(async (input) => {
      if (input.taskRev !== 'r3') throw new Error('Revision conflict')
      return { success: true, handoffFailures: [] }
    })
    try {
      const page = render(<TaskEditorPage taskId="render-1" />)
      fireEvent.click(screen.getByRole('button', { name: 'Retry handoff' }))
      await waitFor(() =>
        expect(mocks.attach).toHaveBeenCalledWith({
          taskId: 'render-1',
          taskRev: 'r3',
          assetId: 'image-saved',
        }),
      )
      mocks.data = {
        ...current,
        task: { ...current.task, handoffPending: false },
      }
      page.rerender(<TaskEditorPage taskId="render-1" />)
      expect((await screen.findByRole('status')).textContent).toBe(
        'Image handoff completed.',
      )
    } finally {
      client.clear()
    }
  })

  it('shows the current pending state after an earlier successful handoff', async () => {
    const page = render(<TaskEditorPage taskId="render-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry handoff' }))
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled())
    mocks.data = {
      ...pendingData(),
      task: { ...pendingData().task, handoffPending: false },
    }
    page.rerender(<TaskEditorPage taskId="render-1" />)
    expect((await screen.findByRole('status')).textContent).toBe(
      'Image handoff completed.',
    )
    mocks.data = {
      ...pendingData(),
      task: { ...pendingData().task, _rev: 'r4' },
    }
    page.rerender(<TaskEditorPage taskId="render-1" />)
    expect(screen.getByRole('alert').textContent).toContain(
      'The render is done and saved. The image has not reached all publishing Tasks listed below yet.',
    )
    expect(
      screen.getByRole('region', { name: 'Studio render' }).textContent,
    ).toBe(
      'Studio renderOpen the promo studioUse an asset from the gallerySkip…' +
        'The render is done and saved. The image has not reached all publishing Tasks listed below yet.' +
        'Prerequisites are advisory: these publishing Tasks can publish without this image until the handoff succeeds.' +
        'Retry handoffRendered; the image is attached to this task.',
    )
  })

  it('shows the placeholder reason after a failed handoff retry and keeps retry available', async () => {
    mocks.attach.mockResolvedValue({
      success: true,
      handoffFailures: ['post-1'],
      handoffIssues: ['Fill in {tier} in the alt text before scheduling.'],
    })
    render(<TaskEditorPage taskId="render-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry handoff' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Fill in {tier} in the alt text before scheduling.',
      ),
    )
    expect(
      (
        screen.getByRole('button', {
          name: 'Retry handoff',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })

  it('keeps the pending state and retry available after a failed retry and another reload', async () => {
    mocks.attach.mockResolvedValue({
      success: true,
      handoffFailures: ['post-1'],
    })
    const first = render(<TaskEditorPage taskId="render-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry handoff' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Some publishing Tasks still need the image. Retry the handoff when it is resolved.',
      ),
    )
    first.unmount()
    mocks.data = structuredClone(pendingData())
    render(<TaskEditorPage taskId="render-1" />)
    expect(screen.getByRole('alert').textContent).toContain(
      'The render is done and saved. The image has not reached all publishing Tasks listed below yet.',
    )
    expect(
      (
        screen.getByRole('button', {
          name: 'Retry handoff',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })

  it('shows the publishing organizer the pending image and links to its recovery Task', () => {
    const renderTask = pendingData().task
    mocks.data = {
      ...pendingData(),
      task: {
        ...renderTask,
        _id: 'publish-1',
        title: 'Publish CFP',
        kind: 'publishing',
        status: 'scheduled',
        handoffPending: false,
        prerequisiteIds: ['render-1'],
      },
      siblings: [renderTask],
    }
    const page = render(<TaskEditorPage taskId="publish-1" />)
    expect(page.container.textContent).toContain(
      'This publishing Task can publish without its image while the handoff is pending.',
    )
    expect(
      screen
        .getByRole('link', { name: 'Retry image handoff: Render the CFP card' })
        .getAttribute('href'),
    ).toBe('/admin/marketing/tasks/render-1')
  })
})

describe('Task editor manual post view — a fresh check on every opening (review T4, round 3)', () => {
  const TAGGED = 'Hello @alice.dev'
  const PLAIN = 'Hello Alice Smith'
  const variant = {
    _id: 'v-1',
    _rev: 'r1',
    postId: 'p-1',
    conferenceId: 'c-1',
    orgId: 'o-1',
    platform: 'bluesky' as const,
    body: TAGGED,
    status: 'awaiting-manual' as const,
    scheduledAt: null,
    usesCustomTime: false,
    claimedAt: null,
    submission: null,
    shortCode: null,
    link: null,
    attachments: [],
    publishResult: null,
    attempts: [],
    attemptCount: 0,
  }
  const editorRead = { post: { attachments: [], defaultScheduledAt: null } }
  function manualTask(): TaskEditorData {
    const data = pendingData()
    return {
      ...data,
      task: {
        ...data.task,
        _id: 'post-1',
        kind: 'publishing',
        channel: 'bluesky',
        variantId: 'v-1',
        complete: false,
        handoffPending: false,
        assetUrl: null,
        assetId: null,
      },
      variant: {
        variant,
        ...editorRead,
        conferenceDomains: [],
        postedLink: null,
      },
    }
  }
  // As the server answers since round 5: always a checked body — the stored
  // one when nothing changed (null here), or the rewritten one.
  const check = (manualBody: string | null) => ({
    variant,
    ...editorRead,
    conferenceDomains: [],
    postedLink: null,
    manualBody: manualBody
      ? { body: manualBody, untagged: ['Alice Smith'], removed: 0 }
      : { body: TAGGED, untagged: [], removed: 0 },
  })

  function setup() {
    // The app's default: data stays fresh for 60 s.
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 60 * 1000, retry: false } },
    })
    mocks.data = manualTask()
    mocks.editorQuery.mockImplementation(function useEditorQuery(
      input: unknown,
      options: object,
    ) {
      return useQuery({
        queryKey: ['social.getVariantEditor', input],
        queryFn: () => mocks.fetchEditor(input),
        ...options,
      })
    } as never)
    mocks.fetchEditor.mockReset()
    return () => (
      <QueryClientProvider client={client}>
        <TaskEditorPage taskId="post-1" />
      </QueryClientProvider>
    )
  }

  it('reopening the page within the 60 s cache never shows the body checked for an earlier opening', async () => {
    const page = setup()
    mocks.fetchEditor.mockResolvedValueOnce(check(null))
    const first = render(page())
    expect(await screen.findByText(TAGGED)).toBeTruthy()
    first.unmount()

    // Alice opts out; the organizer comes back to the Task.
    let answer: (data: unknown) => void = () => {}
    mocks.fetchEditor.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)),
    )
    render(page())
    await waitFor(() => expect(mocks.fetchEditor).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(TAGGED)).toBeNull()
    expect(screen.queryByRole('button', { name: /copy text/i })).toBeNull()

    await act(async () => answer(check(PLAIN)))
    expect(await screen.findByText(PLAIN)).toBeTruthy()
    expect(screen.queryByText(TAGGED)).toBeNull()
  })

  it('reopening while the earlier visit is still checking asks again, and never shows that earlier answer (round 3, T5)', async () => {
    const page = setup()
    let first: (data: unknown) => void = () => {}
    let second: (data: unknown) => void = () => {}
    mocks.fetchEditor
      .mockImplementationOnce(() => new Promise((r) => (first = r)))
      .mockImplementationOnce(() => new Promise((r) => (second = r)))
    const visit = render(page())
    await waitFor(() => expect(mocks.fetchEditor).toHaveBeenCalledTimes(1))
    visit.unmount()
    render(page())
    await waitFor(() => expect(mocks.fetchEditor).toHaveBeenCalledTimes(2))

    await act(async () => first(check(null)))
    expect(screen.queryByText(TAGGED)).toBeNull()
    expect(screen.queryByRole('button', { name: /copy text/i })).toBeNull()

    await act(async () => second(check(PLAIN)))
    expect(await screen.findByText(PLAIN)).toBeTruthy()
  })

  it('a check that could not run can be retried in place: the page has no dialog to close (round 4, T2)', async () => {
    const page = setup()
    mocks.fetchEditor
      .mockResolvedValueOnce({
        ...check(null),
        manualBody: { unavailable: true },
      })
      .mockResolvedValueOnce(check(PLAIN))
    render(page())
    fireEvent.click(await screen.findByRole('button', { name: /check again/i }))
    expect(await screen.findByText(PLAIN)).toBeTruthy()
    expect(mocks.fetchEditor).toHaveBeenCalledTimes(2)
  })

  it('the fresh check says the post went out meanwhile: no copy, no post steps, and the Task is re-read (final round, T2)', async () => {
    const page = setup()
    mocks.fetchEditor.mockResolvedValueOnce({
      ...check(null),
      variant: {
        ...variant,
        status: 'published',
        publishResult: { url: 'https://bsky.app/profile/x/post/1' },
      },
    })
    render(page())
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled())
    // The stale awaiting-manual view must not offer the text to post again.
    expect(screen.queryByRole('button', { name: /copy text/i })).toBeNull()
    expect(screen.queryByText(TAGGED)).toBeNull()
  })

  it('a manual Bluesky answer without a checked body fails closed (final round, T2 sibling)', async () => {
    const page = setup()
    const { manualBody: _dropped, ...unchecked } = check(null)
    void _dropped
    mocks.fetchEditor.mockResolvedValueOnce(unchecked)
    render(page())
    expect(await screen.findByText(/could not check this post/i)).toBeTruthy()
    expect(screen.queryByText(TAGGED)).toBeNull()
  })
})
