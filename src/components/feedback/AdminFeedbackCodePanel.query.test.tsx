/**
 * @vitest-environment jsdom
 *
 * Rotate and Mint against a read already in flight (speaker feedback spec
 * §10.4), through a REAL React Query client: a read of the code that began
 * before the write and lands after it must not put the old code (a dead
 * QR) back over the new one. The tRPC hooks are thin shims over the real
 * `useQuery`, `useMutation` and cache calls.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from '@tanstack/react-query'

const h = vi.hoisted(() => ({
  client: null as unknown as import('@tanstack/react-query').QueryClient,
  reads: [] as (() => Promise<unknown>)[],
  rotate: vi.fn(),
  mint: vi.fn(),
}))

const key = (talkId: string) => ['adminCode', talkId]

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sessionFeedback: {
        adminCode: {
          cancel: (input: { talkId: string }) =>
            h.client.cancelQueries({ queryKey: key(input.talkId) }),
          setData: (input: { talkId: string }, data: unknown) =>
            h.client.setQueryData(key(input.talkId), data),
          invalidate: (input: { talkId: string }) =>
            h.client.invalidateQueries({ queryKey: key(input.talkId) }),
        },
        mintPreview: { invalidate: async () => {} },
      },
    }),
    sessionFeedback: {
      adminCode: {
        useQuery: (input: { talkId: string }) =>
          useQuery({
            queryKey: key(input.talkId),
            queryFn: () => h.reads.shift()!(),
            retry: false,
          }),
      },
      rotateCode: {
        useMutation: (opts: object) =>
          useMutation({ mutationFn: h.rotate, ...opts }),
      },
      mintCode: {
        useMutation: (opts: object) =>
          useMutation({ mutationFn: h.mint, ...opts }),
      },
    },
  },
}))
// The QR and its buttons: only the URL it would show matters here.
vi.mock('./FeedbackCodePanel', () => ({
  FeedbackCodePanel: ({ url }: { url: string }) => <p>QR for {url}</p>,
}))

import { AdminFeedbackCodePanel } from './AdminFeedbackCodePanel'

const WINDOW = {
  state: 'before',
  opensAt: '2099-10-27T08:00:00.000Z',
  lastSlotEnd: '2099-10-27T08:40:00.000Z',
  closesAt: '2099-10-28T08:40:00.000Z',
  feedbackVisible: false,
}
const OLD = {
  code: 'k7m2qx',
  url: 'https://x/f/k7m2qx',
  window: WINDOW,
  mayMint: false,
  mayRotate: true,
}
const NONE = {
  code: null,
  url: null,
  window: WINDOW,
  mayMint: true,
  mayRotate: false,
}

afterEach(() => {
  cleanup()
  h.reads = []
})

/** A read held open until the test lets it land. */
function heldRead(data: unknown) {
  let land: () => void = () => {}
  const read = () => new Promise((resolve) => (land = () => resolve(data)))
  return { read, land: () => land() }
}

async function confirm(name: string) {
  const button = within(await screen.findByRole('dialog')).getByRole('button', {
    name,
  })
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'), {
    timeout: 2000,
  })
  fireEvent.click(button)
}

function setup(first: unknown) {
  h.client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  h.reads.push(async () => first)
  render(
    <QueryClientProvider client={h.client}>
      <AdminFeedbackCodePanel talkId="talk-1" title="T" />
    </QueryClientProvider>,
  )
}

describe('AdminFeedbackCodePanel against a read in flight', () => {
  it('Rotate: an old-code read that lands after the rotation never brings the dead QR back', async () => {
    setup(OLD)
    expect(await screen.findByText('QR for https://x/f/k7m2qx')).toBeTruthy()
    // A refocus starts a read of the code: it will answer with the old one.
    const late = heldRead(OLD)
    h.reads.push(late.read)
    act(() => {
      void h.client.refetchQueries({ queryKey: key('talk-1') })
    })
    h.rotate.mockResolvedValue({
      code: 'p4hw7c',
      url: 'https://x/f/p4hw7c',
      window: WINDOW,
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Rotate Feedback Code' }),
    )
    await confirm('Rotate')
    expect(await screen.findByText('QR for https://x/f/p4hw7c')).toBeTruthy()
    // Now the old read lands.
    await act(async () => late.land())
    expect(screen.getByText('QR for https://x/f/p4hw7c')).toBeTruthy()
    expect(screen.queryByText('QR for https://x/f/k7m2qx')).toBeNull()
    expect(h.client.getQueryData(key('talk-1'))).toMatchObject({
      code: 'p4hw7c',
    })
  })

  it('Mint: a no-code read that lands after the mint never takes the new code away', async () => {
    setup(NONE)
    await screen.findByRole('button', { name: 'Mint Feedback Code' })
    const late = heldRead(NONE)
    h.reads.push(late.read)
    act(() => {
      void h.client.refetchQueries({ queryKey: key('talk-1') })
    })
    h.mint.mockResolvedValue({
      code: 'k7m2qx',
      url: 'https://x/f/k7m2qx',
      window: WINDOW,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mint Feedback Code' }))
    expect(await screen.findByText('QR for https://x/f/k7m2qx')).toBeTruthy()
    await act(async () => late.land())
    expect(screen.getByText('QR for https://x/f/k7m2qx')).toBeTruthy()
    expect(h.client.getQueryData(key('talk-1'))).toMatchObject({
      code: 'k7m2qx',
    })
  })

  const NEW = {
    code: 'p4hw7c',
    url: 'https://x/f/p4hw7c',
    window: WINDOW,
    mayMint: false,
    mayRotate: true,
  }
  const failedRead = async () => {
    throw new Error('502 bad gateway')
  }
  const notice =
    'Couldn’t confirm the current code. Retry before printing or sharing it.'

  it('a Rotate whose reply is lost, then a failed read: nothing printable until a Retry confirms the code', async () => {
    setup(OLD)
    expect(await screen.findByText('QR for https://x/f/k7m2qx')).toBeTruthy()
    // The rotation landed, but its reply is lost; so is the read after it.
    h.rotate.mockRejectedValue(new Error('502 bad gateway'))
    h.reads.push(failedRead)
    fireEvent.click(
      screen.getByRole('button', { name: 'Rotate Feedback Code' }),
    )
    await confirm('Rotate')
    expect(await screen.findByText(notice)).toBeTruthy()
    // React Query still holds the old code: none of it is offered.
    expect(h.client.getQueryData(key('talk-1'))).toMatchObject({
      code: 'k7m2qx',
    })
    expect(screen.queryByText(/^QR for/)).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Rotate Feedback Code' }),
    ).toBeNull()
    // Not "try again": the rotation may have landed.
    expect(screen.queryByText(/could not be rotated/)).toBeNull()
    // Retry: the read says which code is current.
    h.reads.push(async () => NEW)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('QR for https://x/f/p4hw7c')).toBeTruthy()
    expect(screen.queryByText(notice)).toBeNull()
  })

  it('while the read after a lost reply is still on its way, nothing is printable', async () => {
    setup(OLD)
    await screen.findByText('QR for https://x/f/k7m2qx')
    h.rotate.mockRejectedValue(new Error('502 bad gateway'))
    const late = heldRead(NEW)
    h.reads.push(late.read)
    fireEvent.click(
      screen.getByRole('button', { name: 'Rotate Feedback Code' }),
    )
    await confirm('Rotate')
    expect(await screen.findByText(notice)).toBeTruthy()
    expect(screen.queryByText(/^QR for/)).toBeNull()
    await act(async () => late.land())
    expect(await screen.findByText('QR for https://x/f/p4hw7c')).toBeTruthy()
  })

  it('a refused Rotate wrote nothing: the code stays printable while it is read again', async () => {
    setup(OLD)
    await screen.findByText('QR for https://x/f/k7m2qx')
    h.rotate.mockRejectedValue(
      Object.assign(new Error('This talk’s code is now w9nn3r'), {
        data: { code: 'CONFLICT' },
      }),
    )
    const late = heldRead(OLD)
    h.reads.push(late.read)
    fireEvent.click(
      screen.getByRole('button', { name: 'Rotate Feedback Code' }),
    )
    await confirm('Rotate')
    expect(
      await screen.findByText('This talk’s code is now w9nn3r'),
    ).toBeTruthy()
    expect(screen.queryByText(notice)).toBeNull()
    expect(screen.getByText('QR for https://x/f/k7m2qx')).toBeTruthy()
    await act(async () => late.land())
  })

  it('a Rotate whose reply is lost, then a read that lands: the code it holds is shown, no notice', async () => {
    setup(OLD)
    await screen.findByText('QR for https://x/f/k7m2qx')
    h.rotate.mockRejectedValue(new Error('502 bad gateway'))
    h.reads.push(async () => NEW)
    fireEvent.click(
      screen.getByRole('button', { name: 'Rotate Feedback Code' }),
    )
    await confirm('Rotate')
    expect(await screen.findByText('QR for https://x/f/p4hw7c')).toBeTruthy()
    expect(screen.queryByText(notice)).toBeNull()
  })

  it('after a Rotate, a read that fails hides the code until one lands', async () => {
    setup(OLD)
    await screen.findByText('QR for https://x/f/k7m2qx')
    h.rotate.mockResolvedValue({
      code: 'p4hw7c',
      url: 'https://x/f/p4hw7c',
      window: WINDOW,
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Rotate Feedback Code' }),
    )
    await confirm('Rotate')
    await screen.findByText('QR for https://x/f/p4hw7c')
    // A later read of the code fails.
    h.reads.push(failedRead)
    await act(async () => {
      await h.client.refetchQueries({ queryKey: key('talk-1') })
    })
    expect(await screen.findByText(notice)).toBeTruthy()
    expect(screen.queryByText(/^QR for/)).toBeNull()
  })
})
