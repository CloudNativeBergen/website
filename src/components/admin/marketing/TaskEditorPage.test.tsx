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
  data: null as TaskEditorData | null,
  fetch: vi.fn(),
  attach: vi.fn(),
  invalidate: vi.fn(),
  notify: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
  query: vi.fn(),
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
      }),
      marketing: {
        task: {
          get: { useQuery: mocks.query },
          attachAsset: { useMutation: () => ({ mutateAsync: mocks.attach }) },
          delete: mutation,
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
      handoffPending: false,
      targetPage: '/tickets',
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

describe('Task editor outreach', () => {
  beforeEach(() => {
    mocks.data = outreachData()
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
    taggedLink: null,
    pages: [],
    organizers: [],
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
      'Studio renderOpen the promo studioSkip…' +
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
