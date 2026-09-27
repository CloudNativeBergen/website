/**
 * @vitest-environment jsdom
 *
 * Review T4 (#1152): the manual post view runs the tag check "when it
 * opens". The dialog stays mounted while closed, and the app's queries keep
 * data fresh for 60 s — so a reopen could show, and let an organizer copy,
 * the body checked BEFORE a speaker opted out. Each opening must show only
 * data fetched for that opening.
 *
 * The tRPC hook is replaced by REAL React Query (the app's 60 s staleTime),
 * so the cache behaviour under test is the library's, not a mock's.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import type { SocialVariantEditorData } from '@/lib/social/types'

const h = vi.hoisted(() => ({ fetchEditor: vi.fn() }))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      social: {
        listVariants: { invalidate: vi.fn() },
        getVariantEditor: { invalidate: vi.fn() },
      },
    }),
    social: {
      getVariantEditor: {
        useQuery: (input: { variantId: string }, opts: object) =>
          useQuery({
            queryKey: ['social.getVariantEditor', input],
            queryFn: () => h.fetchEditor(input),
            ...opts,
          }),
      },
      markPosted: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          variables: undefined,
        }),
      },
    },
  },
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))

import { ManualPostDialog } from './ManualPostDialog'

const TAGGED = 'Hello @alice.dev'
const PLAIN = 'Hello Alice Smith'

const editor = (manualBody: string | null): SocialVariantEditorData => ({
  variant: {
    _id: 'v-1',
    _rev: 'r1',
    postId: 'p-1',
    conferenceId: 'c-1',
    orgId: 'o-1',
    platform: 'bluesky',
    body: TAGGED,
    status: 'awaiting-manual',
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
  },
  post: { attachments: [], defaultScheduledAt: null },
  conferenceDomains: [],
  ...(manualBody
    ? {
        manualBody: { body: manualBody, untagged: ['Alice Smith'], removed: 0 },
      }
    : {}),
})

afterEach(cleanup)

describe('ManualPostDialog — a fresh check on every opening (review T4)', () => {
  it('a reopen never shows the body checked for an earlier opening', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 60 * 1000, retry: false } },
    })
    const view = (variantId: string | null) => (
      <QueryClientProvider client={client}>
        <ManualPostDialog variantId={variantId} onClose={() => {}} />
      </QueryClientProvider>
    )

    // First opening: nobody has opted out yet.
    h.fetchEditor.mockResolvedValueOnce(editor(null))
    const { rerender } = render(view('v-1'))
    expect(await screen.findByText(TAGGED)).toBeTruthy()
    rerender(view(null))
    // Closing asks nothing.
    await new Promise((r) => setTimeout(r, 50))
    expect(h.fetchEditor).toHaveBeenCalledTimes(1)

    // Alice opts out. The next opening's check must be the one shown.
    let answer: (data: SocialVariantEditorData) => void = () => {}
    h.fetchEditor.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)),
    )
    rerender(view('v-1'))

    // While the new check is in flight, the old tagged body is NOT offered.
    await waitFor(() => expect(h.fetchEditor).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(TAGGED)).toBeNull()
    expect(screen.queryByRole('button', { name: /copy text/i })).toBeNull()

    await act(async () => answer(editor(PLAIN)))
    expect(await screen.findByText(PLAIN)).toBeTruthy()
    expect(screen.queryByText(TAGGED)).toBeNull()
  })
})
