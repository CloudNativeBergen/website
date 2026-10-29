/**
 * @vitest-environment jsdom
 *
 * The admin nav's Photo Wall badge follows `/admin/photo-wall` (Photo Wall
 * spec §10, P6), over the REAL tRPC React client and React Query with the
 * app's defaults: the shell's count hook, the page's `PendingSummary` and a
 * poller with the page's own options. Only the transport is replaced, by a
 * terminating link that answers each procedure from `h.answers` and records
 * the calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { TRPCLink } from '@trpc/client'
import { observable } from '@trpc/server/observable'
import { useAdminNavCounts } from '@/components/admin/useAdminNavCounts'
import type {
  ModerationQueueData,
  WallPostStatus,
} from '@/lib/photo-wall/moderation'
import { api } from '@/lib/trpc/client'
import type { AppRouter } from '@/server/_app'
import { PendingSummary } from './PendingSummary'
import { MODERATION_POLL_MS, moderationQueuePolling } from './polling'

const h = vi.hoisted(() => ({
  answers: {} as Record<string, () => Promise<unknown>>,
  calls: [] as string[],
}))

const link: TRPCLink<AppRouter> =
  () =>
  ({ op }) =>
    observable((observer) => {
      h.calls.push(op.path)
      const answer = h.answers[op.path]
      if (!answer) throw new Error(`no answer for ${op.path}`)
      answer().then((data) => {
        observer.next({ result: { type: 'data', data } })
        observer.complete()
      })
    })

const queueOf = (...statuses: WallPostStatus[]): ModerationQueueData => ({
  posts: statuses.map((status, i) => ({
    _id: `wallPost-${i}`,
    status,
    photo: null,
    crop: { x: 0.5, y: 0.5 },
    caption: null,
    name: null,
    marketingConsent: false,
    submittedAt: null,
    approvedAt: null,
    decidedAt: null,
    incarnation: { createdAt: null, assetId: null },
  })),
})

/** The shell's Photo Wall badge, as the count the nav would show. */
function Badge() {
  const { pendingWallPosts } = useAdminNavCounts()
  return <output data-testid="badge">{pendingWallPosts ?? 'none'}</output>
}

/** `/admin/photo-wall`: the summary, and the queue's poll beside it. */
function Page() {
  api.photoWall.moderationQueue.useQuery(undefined, moderationQueuePolling)
  return <PendingSummary />
}

function Harness({ page }: { page: boolean }) {
  return (
    <>
      <Badge />
      {page && <Page />}
    </>
  )
}

let mount: (page: boolean) => void
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  h.calls.length = 0
  h.answers = {
    'sessionFeedback.flaggedCount': async () => 0,
    'photoWall.pendingCount': async () => 5,
    'photoWall.moderationQueue': async () => queueOf(),
  }
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })
  const client = api.createClient({ links: [link] })
  const tree = (page: boolean) => (
    <api.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Harness page={page} />
      </QueryClientProvider>
    </api.Provider>
  )
  let rerender: ((ui: React.ReactElement) => void) | null = null
  mount = (page) => {
    if (rerender) rerender(tree(page))
    else rerender = render(tree(page)).rerender
  }
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/**
 * Lets every answer, render, effect and React Query notification land, on
 * real `setTimeout`s. With `setTimeout` faked, the push from the page's
 * effect updated the shell's observer but never re-rendered the shell in
 * jsdom (cause not pinned down); in Storybook, where nothing is faked, it
 * does (`Nav badge / Photo Wall Follows Page`). Only the poll's
 * `setInterval` and the clock are fake here.
 */
const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await act(() => vi.advanceTimersByTimeAsync(0))
    await act(() => new Promise<void>((r) => setTimeout(r, 0)))
  }
}
const badge = () => screen.getByTestId('badge').textContent
const countReads = () =>
  h.calls.filter((path) => path === 'photoWall.pendingCount').length

describe('the Photo Wall badge follows /admin/photo-wall (P6)', () => {
  it("takes each count the page polls, the page's actions included, with no read of its own", async () => {
    mount(false)
    await settle()
    expect(badge()).toBe('5')

    h.answers['photoWall.moderationQueue'] = async () =>
      queueOf('pending', 'approved', 'pending', 'notShown', 'deleting')
    mount(true)
    await settle()
    expect(badge()).toBe('2')

    // An Approve all lands on the next poll.
    h.answers['photoWall.moderationQueue'] = async () =>
      queueOf('approved', 'approved')
    await act(() => vi.advanceTimersByTimeAsync(MODERATION_POLL_MS))
    await settle()
    expect(badge()).toBe('0')
    expect(countReads()).toBe(1)
  })

  it('a queue cached from an earlier visit does not put the badge back', async () => {
    h.answers['photoWall.moderationQueue'] = async () =>
      queueOf('pending', 'pending')
    mount(true)
    await settle()
    expect(badge()).toBe('2')

    // Off the page; back on the tab later, the shell reads a fresh count.
    mount(false)
    h.answers['photoWall.pendingCount'] = async () => 7
    await act(() => vi.advanceTimersByTimeAsync(61_000))
    act(() => window.dispatchEvent(new Event('visibilitychange')))
    await settle()
    expect(badge()).toBe('7')

    // Back on the page: its cached queue (2 pending) shows at once while the
    // page's own read is out; the badge keeps the newer 7.
    let answer: (queue: ModerationQueueData) => void = () => {}
    h.answers['photoWall.moderationQueue'] = () =>
      new Promise((resolve) => (answer = resolve))
    mount(true)
    await settle()
    expect(screen.getByTestId('pending-summary')).toHaveTextContent(
      '2 photos waiting',
    )
    expect(badge()).toBe('7')

    // The page's own read answers: that count is the newest.
    await act(async () => answer(queueOf('pending', 'pending', 'pending')))
    await settle()
    expect(badge()).toBe('3')
  })

  it("an older count still in flight does not overwrite the page's push", async () => {
    // The shell's read is out when the page's poll answers.
    let answerCount: (n: number) => void = () => {}
    h.answers['photoWall.pendingCount'] = () =>
      new Promise((resolve) => (answerCount = resolve))
    h.answers['photoWall.moderationQueue'] = async () =>
      queueOf('pending', 'pending')
    mount(true)
    await settle()
    expect(badge()).toBe('2')

    // The older read answers after the push: it must not land.
    await act(async () => answerCount(5))
    await settle()
    expect(badge()).toBe('2')

    // Nor once the organizer leaves the page.
    mount(false)
    await settle()
    expect(badge()).toBe('2')
    expect(countReads()).toBe(1)
  })
})
