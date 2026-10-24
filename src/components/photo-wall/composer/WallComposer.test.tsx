/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PolaroidEditorProps } from './PolaroidEditor'
import { WallComposer } from './WallComposer'

const bakes = vi.hoisted(
  () =>
    [] as {
      resolve: (photo: Blob) => void
      // Whether the page already said so when the heavy bake began.
      preparingShown: boolean
    }[],
)

const decodes = vi.hoisted(
  () =>
    new Map<
      string,
      { resolve: (master: HTMLCanvasElement) => void; reject: () => void }
    >(),
)

vi.mock('@/lib/photo-wall/photo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/photo-wall/photo')>()),
  decodeWallPhoto: (file: File) =>
    new Promise<HTMLCanvasElement>((resolve, reject) =>
      decodes.set(file.name, {
        resolve,
        reject: () => reject(new Error('could not decode')),
      }),
    ),
  bakeWallPhoto: () =>
    new Promise<Blob>((resolve) =>
      bakes.push({
        resolve,
        preparingShown: !!document.body.textContent?.includes(
          'Preparing your photo…',
        ),
      }),
    ),
}))

// The editor and the strip paint on a canvas, which jsdom has not got: show
// which photo they were handed instead.
vi.mock('./PolaroidEditor', () => ({
  PolaroidEditor: ({
    master,
    caption,
    name,
    onCaption,
    onName,
    onCrop,
  }: PolaroidEditorProps) => (
    <>
      <p>editing {master.dataset.photo}</p>
      <textarea
        aria-label="Caption"
        value={caption}
        onChange={(e) => onCaption(e.target.value)}
      />
      <input
        aria-label="Your name (optional)"
        value={name}
        onChange={(e) => onName(e.target.value)}
      />
      {/* Where fifteen ArrowLeft presses on a 2048x512 photo end up. */}
      <button type="button" onClick={() => onCrop({ x: 9.71e-17, y: 0.5 })}>
        nudge to the left edge
      </button>
    </>
  ),
}))
vi.mock('./FilterStrip', () => ({ FilterStrip: () => null }))

function canvasFor(photo: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.dataset.photo = photo
  return canvas
}

/** Renders the composer and opens `photo` in it. */
async function compose(photo: string, onSubmit = vi.fn()) {
  render(
    <WallComposer logo={null} deletesOn="2026-11-26" onSubmit={onSubmit} />,
  )
  await pickAgain(photo)
  return onSubmit
}

async function pickAgain(photo: string) {
  fireEvent.change(screen.getByLabelText('Choose from your photos'), {
    target: { files: [new File([photo], `${photo}.jpg`)] },
  })
  await act(async () => decodes.get(`${photo}.jpg`)?.resolve(canvasFor(photo)))
  expect(screen.getByText(/^editing /)).toHaveTextContent(`editing ${photo}`)
}

/** Disabled, by its own attribute or a disabled fieldset around it. */
const isLocked = (element: Element) => element.matches(':disabled')

const marketingBox = () =>
  screen.getByRole<HTMLInputElement>('checkbox', { name: /marketing/ })

beforeEach(() => {
  bakes.length = 0
  // jsdom keeps one history across the file: start each test on an entry of
  // the page's own, as a fresh visit to /wall/post would.
  window.history.pushState(null, '')
})

describe('WallComposer', () => {
  it('keeps the photo picked last when an earlier one finishes opening after it', async () => {
    render(
      <WallComposer logo={null} deletesOn="2026-11-26" onSubmit={vi.fn()} />,
    )
    const choose = screen.getByLabelText('Choose from your photos')
    fireEvent.change(choose, { target: { files: [new File(['a'], 'a.jpg')] } })
    fireEvent.change(choose, { target: { files: [new File(['b'], 'b.jpg')] } })

    await act(async () => decodes.get('b.jpg')?.resolve(canvasFor('b')))
    await act(async () => decodes.get('a.jpg')?.resolve(canvasFor('a')))

    expect(screen.getByText(/^editing /)).toHaveTextContent('editing b')
  })

  it('stays on the photo picked last when an earlier one fails to open after it', async () => {
    render(
      <WallComposer logo={null} deletesOn="2026-11-26" onSubmit={vi.fn()} />,
    )
    const choose = screen.getByLabelText('Choose from your photos')
    fireEvent.change(choose, { target: { files: [new File(['c'], 'c.jpg')] } })
    fireEvent.change(choose, { target: { files: [new File(['d'], 'd.jpg')] } })

    await act(async () => decodes.get('d.jpg')?.resolve(canvasFor('d')))
    await act(async () => decodes.get('c.jpg')?.reject())

    expect(screen.getByText(/^editing /)).toHaveTextContent('editing d')
  })

  it('says Preparing your photo before the heavy bake starts', async () => {
    await compose('prep')
    fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' }))

    await waitFor(() => expect(bakes).toHaveLength(1))
    expect(bakes[0].preparingShown).toBe(true)
  })

  it('locks the card, the consent and Another photo while posting, and posts what the screen shows', async () => {
    let finishSending = () => {}
    const onSubmit = await compose(
      'lock',
      vi.fn(() => new Promise<void>((done) => (finishSending = done))),
    )
    fireEvent.change(screen.getByLabelText('Caption'), {
      target: { value: 'hello' },
    })
    fireEvent.click(marketingBox())
    expect(marketingBox().checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' }))
    await waitFor(() => expect(bakes).toHaveLength(1))
    for (const busy of ['baking', 'sending']) {
      // The person changes their mind while it goes out. (The element's own
      // click(), as a tap: jsdom's dispatched click ignores `disabled`.)
      marketingBox().click()
      screen.getByRole('button', { name: /Another photo/ }).click()
      expect({
        busy,
        consentLocked: isLocked(marketingBox()),
        captionLocked: isLocked(screen.getByLabelText('Caption')),
        nameLocked: isLocked(screen.getByLabelText('Your name (optional)')),
        cropLocked: isLocked(screen.getByRole('button', { name: /nudge/ })),
        anotherPhotoLocked: isLocked(
          screen.getByRole('button', { name: /Another photo/ }),
        ),
        consent: marketingBox().checked,
        photo: screen.getByText(/^editing /).textContent,
      }).toEqual({
        busy,
        consentLocked: true,
        captionLocked: true,
        nameLocked: true,
        cropLocked: true,
        anotherPhotoLocked: true,
        consent: true,
        photo: 'editing lock',
      })
      if (busy === 'baking') {
        await act(async () =>
          bakes[0].resolve(new Blob(['x'], { type: 'image/jpeg' })),
        )
        expect(onSubmit).toHaveBeenCalledTimes(1)
      }
    }
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      caption: 'hello',
      marketingConsent: marketingBox().checked,
    })
    // The Post button keeps focus: it is aria-disabled, not disabled.
    expect(screen.getByRole('button', { name: 'Posting…' })).not.toBeDisabled()

    await act(async () => finishSending())
    expect(isLocked(marketingBox())).toBe(false)
  })

  it('hands on a crop the server can read, not one in exponent form', async () => {
    const onSubmit = await compose('edge')
    fireEvent.click(screen.getByRole('button', { name: /nudge/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' }))
    await waitFor(() => expect(bakes).toHaveLength(1))
    await act(async () =>
      bakes[0].resolve(new Blob(['x'], { type: 'image/jpeg' })),
    )

    expect(onSubmit.mock.calls[0][0].crop).toEqual({ x: 0, y: 0.5 })
  })

  it('a new photo starts with the marketing box unticked and no caption, and keeps the name', async () => {
    await compose('first')
    fireEvent.change(screen.getByLabelText('Caption'), {
      target: { value: 'about the first photo' },
    })
    fireEvent.change(screen.getByLabelText('Your name (optional)'), {
      target: { value: 'Ada' },
    })
    fireEvent.click(marketingBox())
    expect(marketingBox().checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /Another photo/ }))
    await waitFor(() => screen.getByLabelText('Choose from your photos'))
    await pickAgain('second')

    expect({
      consent: marketingBox().checked,
      caption: screen.getByLabelText<HTMLTextAreaElement>('Caption').value,
      name: screen.getByLabelText<HTMLInputElement>('Your name (optional)')
        .value,
    }).toEqual({ consent: false, caption: '', name: 'Ada' })
  })

  it('the back gesture returns to the landing instead of leaving the page', async () => {
    const before = window.history.length
    await compose('back')
    expect(window.history.length).toBe(before + 1)

    await act(async () => window.history.back())

    await waitFor(() =>
      expect(screen.queryByText(/^editing /)).not.toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Choose from your photos')).toBeInTheDocument()
  })

  it('Another photo takes the composer’s history entry back off', async () => {
    await compose('another')
    const length = window.history.length
    expect(window.history.state).toMatchObject({ wallComposer: true })

    fireEvent.click(screen.getByRole('button', { name: /Another photo/ }))

    await waitFor(() =>
      expect(screen.queryByText(/^editing /)).not.toBeInTheDocument(),
    )
    expect(window.history.state?.wallComposer).toBeUndefined()
    // Opening the next photo reuses the entry rather than stacking another.
    await pickAgain('another-2')
    expect(window.history.length).toBe(length)
  })

  it('Back while a post is going out stays on the composer', async () => {
    await compose('posting-back')
    fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' }))
    await waitFor(() => expect(bakes).toHaveLength(1))

    await act(async () => window.history.back())
    await act(() => new Promise((done) => setTimeout(done, 50)))

    expect(screen.getByText(/^editing /)).toHaveTextContent(
      'editing posting-back',
    )
    expect(window.history.state).toMatchObject({ wallComposer: true })
  })
})
