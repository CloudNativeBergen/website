/**
 * @vitest-environment jsdom
 *
 * The composer wired to Submit (Photo Wall spec §6.1, §6.3, §6.5): the device
 * cookie before the first post, the `uploadId` of each press, the §6.3
 * messages and the Waiting for approval card. `post` stands in for the
 * request (`src/lib/photo-wall/post.test.ts` covers how an answer is read);
 * the photo's decode and bake, which need a real canvas, are stubbed as in
 * `WallComposer.test.tsx`.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WallPostAttempt, WallPostRequest } from '@/lib/photo-wall/post'
import type { PolaroidEditorProps } from './PolaroidEditor'
import { ENSURE_DEVICE_TIMEOUT_MS, WallPoster } from './WallPoster'

const decodes = vi.hoisted(
  () => new Map<string, (master: HTMLCanvasElement) => void>(),
)

vi.mock('@/lib/photo-wall/photo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/photo-wall/photo')>()),
  decodeWallPhoto: (file: File) =>
    new Promise<HTMLCanvasElement>((resolve) =>
      decodes.set(file.name, resolve),
    ),
  // The "JPEG" is the photo's name, so each photo has its own bytes.
  bakeWallPhoto: async (master: HTMLCanvasElement) =>
    new Blob([master.dataset.photo ?? ''], { type: 'image/jpeg' }),
}))
vi.mock('./PolaroidEditor', () => ({
  PolaroidEditor: ({ master, caption, onCaption }: PolaroidEditorProps) => (
    <>
      <p>editing {master.dataset.photo}</p>
      <textarea
        aria-label="Caption"
        value={caption}
        onChange={(e) => onCaption(e.target.value)}
      />
    </>
  ),
}))
vi.mock('./FilterStrip', () => ({ FilterStrip: () => null }))

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

let objectUrls = 0
beforeEach(() => {
  decodes.clear()
  objectUrls = 0
  URL.createObjectURL = vi.fn(() => `blob:photo-${++objectUrls}`)
  URL.revokeObjectURL = vi.fn()
  window.history.pushState(null, '')
})

/** A `post` answering each call with the next of `answers`. */
function postAnswering(...answers: WallPostAttempt[]) {
  return vi.fn<(request: WallPostRequest) => Promise<WallPostAttempt>>(
    async () => {
      const answer = answers.shift()
      if (!answer) throw new Error('no more answers')
      return answer
    },
  )
}

function renderPoster(
  post: ReturnType<typeof postAnswering>,
  ensureDevice: () => Promise<boolean> = async () => true,
) {
  render(
    <WallPoster
      logo={null}
      deletesOn="2026-11-26"
      ensureDevice={ensureDevice}
      post={post}
    />,
  )
}

async function pick(photo: string) {
  fireEvent.change(screen.getByLabelText('Choose from your photos'), {
    target: { files: [new File([photo], `${photo}.jpg`)] },
  })
  const canvas = document.createElement('canvas')
  canvas.dataset.photo = photo
  await act(async () => decodes.get(`${photo}.jpg`)?.(canvas))
  expect(screen.getByText(/^editing /)).toHaveTextContent(`editing ${photo}`)
}

const postButton = () =>
  screen.getByRole('button', { name: /Post to the wall|Posting…|Preparing/ })

/** Press Post and wait until the press has run its course. */
async function press() {
  fireEvent.click(postButton())
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: /Posting…|Preparing/ }),
    ).toBeNull(),
  )
}

const uploadIds = (post: ReturnType<typeof postAnswering>) =>
  post.mock.calls.map(([request]) => request.uploadId)

describe('WallPoster', () => {
  it('keeps Post to the wall disabled until ensureDevice has answered', async () => {
    let answer: (ok: boolean) => void = () => {}
    const ensureDevice = vi.fn(
      () => new Promise<boolean>((resolve) => (answer = resolve)),
    )
    const post = postAnswering({ ok: true })
    renderPoster(post, ensureDevice)
    await pick('early')

    expect(postButton()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(postButton())
    await act(async () => {})
    expect(post).not.toHaveBeenCalled()

    await act(async () => answer(true))
    expect(postButton()).toHaveAttribute('aria-disabled', 'false')
    await press()
    expect(post).toHaveBeenCalledTimes(1)
    expect(ensureDevice).toHaveBeenCalledTimes(1)
  })

  it('asks ensureDevice once more on the press when the first call failed', async () => {
    const ensureDevice = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(true)
    const post = postAnswering({ ok: true })
    renderPoster(post, ensureDevice)
    await pick('retry-device')
    await waitFor(() =>
      expect(postButton()).toHaveAttribute('aria-disabled', 'false'),
    )
    await press()
    expect(ensureDevice).toHaveBeenCalledTimes(2)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('does not post when ensureDevice still cannot set the cookie', async () => {
    const post = postAnswering({ ok: true })
    renderPoster(post, async () => false)
    await pick('no-device')
    await waitFor(() =>
      expect(postButton()).toHaveAttribute('aria-disabled', 'false'),
    )
    await press()
    expect(post).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong. Your photo wasn’t posted. Try again.',
    )
  })

  it('posts with a UUID v4 uploadId and shows the post Waiting for approval', async () => {
    const post = postAnswering({ ok: true })
    renderPoster(post)
    await pick('fjord')
    fireEvent.change(screen.getByLabelText('Caption'), {
      target: { value: '  Hei  fra fjorden ' },
    })
    await press()

    expect(post).toHaveBeenCalledTimes(1)
    const [[request]] = post.mock.calls
    expect(request.uploadId).toMatch(UUID_V4)
    expect(request).toMatchObject({
      caption: 'Hei fra fjorden',
      crop: { x: 0.5, y: 0.5 },
      marketingConsent: false,
    })
    expect(await request.photo.text()).toBe('fjord')

    expect(screen.getByRole('heading', { name: 'My posts' })).toHaveFocus()
    expect(
      screen.queryByRole('button', { name: /Post to the wall/ }),
    ).toBeNull()
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Your photo: Hei fra fjorden' }),
    ).toHaveAttribute('src', 'blob:photo-1')
    expect(screen.getByRole('link', { name: 'See the wall' })).toHaveAttribute(
      'href',
      '/wall',
    )
  })

  it('puts the next post on top, with a new uploadId', async () => {
    const post = postAnswering({ ok: true }, { ok: true })
    renderPoster(post)
    await pick('first')
    await press()
    fireEvent.click(screen.getByRole('button', { name: 'Post another photo' }))
    await pick('second')
    await press()

    const [a, b] = uploadIds(post)
    expect(a).not.toBe(b)
    expect(
      screen.getAllByRole('img').map((img) => img.getAttribute('src')),
    ).toEqual(['blob:photo-2', 'blob:photo-1'])
    expect(screen.getAllByText('Waiting for approval')).toHaveLength(2)
  })

  it.each([
    [
      'pendingDevice',
      'You have 3 photos waiting for approval. You can post again once an organizer has looked at one.',
    ],
    [
      'hourly',
      'You’ve posted 10 photos in the last hour. Try again a bit later.',
    ],
    [
      'pendingWall',
      'Lots of photos are waiting right now. Try again in a few minutes.',
    ],
    ['failed', 'Something went wrong. Your photo wasn’t posted. Try again.'],
  ] as const)(
    'a %s refusal shows its message, keeps the photo and caption, and the next press uses a new uploadId',
    async (refusal, message) => {
      const post = postAnswering({ ok: false, refusal }, { ok: true })
      renderPoster(post)
      await pick('kept')
      fireEvent.change(screen.getByLabelText('Caption'), {
        target: { value: 'still here' },
      })
      await press()

      expect(screen.getByRole('alert')).toHaveTextContent(message)
      expect(screen.getByText(/^editing /)).toHaveTextContent('editing kept')
      expect(screen.getByLabelText('Caption')).toHaveValue('still here')
      expect(screen.queryByRole('link', { name: 'See the wall' })).toBeNull()

      await press()
      const [first, second] = uploadIds(post)
      expect(second).toMatch(UUID_V4)
      expect(second).not.toBe(first)
    },
  )

  it('posting closed shows its message with See the wall', async () => {
    const post = postAnswering({ ok: false, refusal: 'closed' })
    renderPoster(post)
    await pick('late')
    await press()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The wall isn’t open for photos right now.',
    )
    expect(screen.getByRole('link', { name: 'See the wall' })).toHaveAttribute(
      'href',
      '/wall',
    )
  })

  it('a lost response shows the generic message, and the next press retries the same uploadId', async () => {
    const post = postAnswering({ ok: false, lost: true }, { ok: true })
    renderPoster(post)
    await pick('wifi')
    await press()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong. Your photo wasn’t posted. Try again.',
    )

    await press()
    const [first, second] = uploadIds(post)
    expect(second).toBe(first)
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument()
  })

  it('after a lost response, a changed post gets a new uploadId', async () => {
    const post = postAnswering({ ok: false, lost: true }, { ok: true })
    renderPoster(post)
    await pick('wifi')
    await press()
    fireEvent.change(screen.getByLabelText('Caption'), {
      target: { value: 'changed my mind' },
    })
    await press()
    const [first, second] = uploadIds(post)
    expect(second).not.toBe(first)
  })

  it('enables Post once ensureDevice has hung for the timeout; the press asks again and shows the message when that hangs too', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
      shouldAdvanceTime: true,
    })
    try {
      const ensureDevice = vi.fn(() => new Promise<boolean>(() => {}))
      const post = postAnswering({ ok: true })
      renderPoster(post, ensureDevice)
      await pick('hung')
      expect(postButton()).toHaveAttribute('aria-disabled', 'true')

      // Half way, with seconds of margin: the faked clock also moves with
      // real time (`shouldAdvanceTime`), so an exact boundary would race a
      // slow runner.
      await act(async () => {
        vi.advanceTimersByTime(ENSURE_DEVICE_TIMEOUT_MS / 2)
      })
      expect(postButton()).toHaveAttribute('aria-disabled', 'true')
      await act(async () => {
        vi.advanceTimersByTime(ENSURE_DEVICE_TIMEOUT_MS / 2)
      })
      expect(postButton()).toHaveAttribute('aria-disabled', 'false')

      fireEvent.click(postButton())
      await waitFor(() => expect(ensureDevice).toHaveBeenCalledTimes(2))
      await act(async () => {
        vi.advanceTimersByTime(ENSURE_DEVICE_TIMEOUT_MS)
      })
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Something went wrong. Your photo wasn’t posted. Try again.',
        ),
      )
      expect(post).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('after a lost response, another photo of the same size gets a new uploadId', async () => {
    const post = postAnswering({ ok: false, lost: true }, { ok: true })
    renderPoster(post)
    await pick('aaaa')
    await press()
    fireEvent.click(screen.getByRole('button', { name: /Another photo/ }))
    await waitFor(() =>
      expect(screen.queryByText(/^editing /)).not.toBeInTheDocument(),
    )
    await pick('bbbb')
    await press()
    const [first, second] = post.mock.calls.map(([request]) => request)
    expect(first.photo.size).toBe(second.photo.size)
    expect(second.uploadId).not.toBe(first.uploadId)
  })

  it('shows the upload’s progress while the post goes up', async () => {
    let report: (fraction: number) => void = () => {}
    let finish: (attempt: WallPostAttempt) => void = () => {}
    const post = vi.fn(
      (
        ...[, { onProgress }]: [
          WallPostRequest,
          { onProgress?: (fraction: number) => void },
        ]
      ) =>
        new Promise<WallPostAttempt>((resolve) => {
          report = (f) => onProgress?.(f)
          finish = resolve
        }),
    )
    render(
      <WallPoster
        logo={null}
        deletesOn="2026-11-26"
        ensureDevice={async () => true}
        post={post}
      />,
    )
    await pick('progress')
    fireEvent.click(postButton())
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    await act(async () => report(0.423))
    const bar = screen.getByRole('progressbar', {
      name: 'Uploading your photo',
    })
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(postButton()).toHaveTextContent('Posting…')
    await act(async () => finish({ ok: true }))
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})
