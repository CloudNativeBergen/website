/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PhotoDecodeError } from '@/lib/photo-wall/photo'
import { DECODE_FAILED_MESSAGE } from './ComposerLanding'
import type { PolaroidEditorProps } from './PolaroidEditor'
import { ROOM_KEY } from './TalkPicker'
import { STORY_NOW, STORY_SCHEDULES } from './story-schedule'
import { GENERIC_FAILURE_MESSAGE, WallComposer } from './WallComposer'

const bakes = vi.hoisted(
  () =>
    [] as {
      resolve: (photo: Blob) => void
      // Whether the page already said so when the heavy bake began.
      preparingShown: boolean
      filter: string
    }[],
)

const decodes = vi.hoisted(
  () =>
    new Map<
      string,
      {
        resolve: (master: HTMLCanvasElement) => void
        reject: (error?: Error) => void
      }
    >(),
)

vi.mock('@/lib/photo-wall/photo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/photo-wall/photo')>()),
  decodeWallPhoto: (file: File) =>
    new Promise<HTMLCanvasElement>((resolve, reject) =>
      decodes.set(file.name, {
        resolve,
        reject: (error) => reject(error ?? new Error('could not decode')),
      }),
    ),
  bakeWallPhoto: (_master: HTMLCanvasElement, filter: string) =>
    new Promise<Blob>((resolve) =>
      bakes.push({
        resolve,
        preparingShown: !!document.body.textContent?.includes(
          'Preparing your photo…',
        ),
        filter,
      }),
    ),
}))

// The editor and the strip paint on a canvas, which jsdom has not got: show
// which photo they were handed instead.
vi.mock('./PolaroidEditor', () => ({
  PolaroidEditor: ({
    master,
    crop,
    caption,
    name,
    onCaption,
    onName,
    onCrop,
  }: PolaroidEditorProps) => (
    <>
      <p>editing {master.dataset.photo}</p>
      <p>
        crop {crop.x},{crop.y}
      </p>
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
vi.mock('./FilterStrip', () => ({
  FilterStrip: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (filter: 'noir') => void
  }) => (
    <>
      <p>filter {value}</p>
      <button type="button" onClick={() => onChange('noir')}>
        pick Noir
      </button>
    </>
  ),
}))

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

  it('bakes only after two frames, so the status has painted first', async () => {
    const frames: FrameRequestCallback[] = []
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => frames.push(callback))
    try {
      await compose('paint')
      fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' }))
      await waitFor(() => expect(frames).toHaveLength(1))
      await act(async () => frames.shift()?.(0))
      expect(bakes).toHaveLength(0)
      await waitFor(() => expect(frames).toHaveLength(1))
      await act(async () => frames.shift()?.(0))
      await waitFor(() => expect(bakes).toHaveLength(1))
    } finally {
      raf.mockRestore()
    }
  })

  it('clears the failure when a retry goes through, or a new photo is picked', async () => {
    const onSubmit = await compose(
      'retry',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('lost'))
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('lost again')),
    )
    const postOnce = async () => {
      const calls = onSubmit.mock.calls.length
      fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' }))
      // Only the first press bakes: the same photo and filter reuse it.
      if (calls === 0) {
        await waitFor(() => expect(bakes).toHaveLength(1))
        await act(async () =>
          bakes[0].resolve(new Blob([], { type: 'image/jpeg' })),
        )
      }
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(calls + 1))
    }
    await postOnce()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    await postOnce()
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    )

    await postOnce()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Another photo/ }))
    await waitFor(() =>
      expect(screen.queryByText(/^editing /)).not.toBeInTheDocument(),
    )
    await pickAgain('retry-2')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('adds no history entries when posting, however often', async () => {
    const onSubmit = await compose(
      'history',
      vi.fn().mockResolvedValue(undefined),
    )
    const length = window.history.length
    for (let n = 0; n < 2; n += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' }))
      if (n === 0) {
        await waitFor(() => expect(bakes).toHaveLength(1))
        await act(async () =>
          bakes[0].resolve(new Blob([], { type: 'image/jpeg' })),
        )
      }
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(n + 1))
    }
    expect(window.history.length).toBe(length)
  })

  it('posts the same baked photo again while the photo and filter stay, and bakes again for a new filter', async () => {
    const onSubmit = await compose(
      'reuse',
      vi.fn().mockRejectedValue(new Error('lost')),
    )
    const press = async (calls: number) => {
      fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(calls))
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Post to the wall' }),
        ).toHaveAttribute('aria-disabled', 'false'),
      )
    }
    const first = new Blob(['a'], { type: 'image/jpeg' })
    fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' }))
    await waitFor(() => expect(bakes).toHaveLength(1))
    await act(async () => bakes[0].resolve(first))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    await press(2)
    expect(bakes).toHaveLength(1)
    expect(onSubmit.mock.calls[1][0].photo).toBe(first)

    fireEvent.click(screen.getByRole('button', { name: 'pick Noir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' }))
    await waitFor(() => expect(bakes).toHaveLength(2))
    expect(bakes[1].filter).toBe('noir')
  })

  it('moves focus to the landing heading when the composer closes', async () => {
    await compose('focus')
    fireEvent.click(screen.getByRole('button', { name: /Another photo/ }))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Add your photo to the wall' }),
      ).toHaveFocus(),
    )
  })
  it('a second tap on Post while it goes out bakes and posts once', async () => {
    let finish = () => {}
    const onSubmit = await compose(
      'double',
      vi.fn(() => new Promise<void>((done) => (finish = done))),
    )
    const postButton = () =>
      screen.getByRole('button', { name: /Post to the wall|Preparing|Posting/ })
    const settle = async () => {
      await act(() => new Promise((done) => setTimeout(done, 50)))
      await act(async () =>
        bakes.forEach((b) =>
          b.resolve(new Blob(['x'], { type: 'image/jpeg' })),
        ),
      )
    }
    fireEvent.click(postButton())
    await waitFor(() => expect(bakes).toHaveLength(1))
    // Again while baking, and again while sending.
    fireEvent.click(postButton())
    await settle()
    fireEvent.click(postButton())
    await settle()

    expect({ bakes: bakes.length, posts: onSubmit.mock.calls.length }).toEqual({
      bakes: 1,
      posts: 1,
    })
    await act(async () => finish())
  })

  it('bakes the filter that was picked', async () => {
    await compose('noir')
    fireEvent.click(screen.getByRole('button', { name: 'pick Noir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' }))
    await waitFor(() => expect(bakes).toHaveLength(1))

    expect(bakes[0].filter).toBe('noir')
  })

  it('a new photo starts on Original, centred', async () => {
    const onSubmit = await compose('looked')
    fireEvent.click(screen.getByRole('button', { name: 'pick Noir' }))
    fireEvent.click(screen.getByRole('button', { name: /nudge/ }))
    expect(screen.getByText(/^filter /)).toHaveTextContent('filter noir')

    fireEvent.click(screen.getByRole('button', { name: /Another photo/ }))
    await waitFor(() => screen.getByLabelText('Choose from your photos'))
    await pickAgain('looked-2')
    fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' }))
    await waitFor(() => expect(bakes).toHaveLength(1))
    await act(async () =>
      bakes[0].resolve(new Blob(['x'], { type: 'image/jpeg' })),
    )

    expect({
      filter: screen.getByText(/^filter /).textContent,
      crop: screen.getByText(/^crop /).textContent,
      baked: bakes[0].filter,
      posted: onSubmit.mock.calls[0][0].crop,
    }).toEqual({
      filter: 'filter original',
      crop: 'crop 0.5,0.5',
      baked: 'original',
      posted: { x: 0.5, y: 0.5 },
    })
  })

  it('counts the caption as it will be stored: runs of spaces once, dropped characters not at all', async () => {
    await compose('counter')
    fireEvent.change(screen.getByLabelText('Caption'), {
      // Nine code points typed; the stored caption is "a b", three.
      target: { value: '  a \u{200B} b  ' },
    })

    expect(screen.getByTestId('caption-counter').textContent).toBe(
      'Caption: 3/80',
    )
  })

  it('says the photo could not be opened only when it could not be decoded', async () => {
    const open = async (error: Error) => {
      const name = `${error.name}.jpg`
      fireEvent.change(screen.getByLabelText('Choose from your photos'), {
        target: { files: [new File(['x'], name)] },
      })
      await act(async () => decodes.get(name)?.reject(error))
      return screen.getByRole('alert').textContent
    }
    render(
      <WallComposer logo={null} deletesOn="2026-11-26" onSubmit={vi.fn()} />,
    )

    expect({
      undecodable: await open(new PhotoDecodeError('not an image')),
      // Anything else (out of memory, no 2D context) is not the photo's fault.
      other: await open(new RangeError('Out of memory')),
    }).toEqual({
      undecodable: DECODE_FAILED_MESSAGE,
      other: GENERIC_FAILURE_MESSAGE,
    })
  })
})

describe('WallComposer Talk row (Talk photos spec §6.1)', () => {
  beforeEach(() => sessionStorage.clear())

  async function composeTagged(photo: string) {
    const onSubmit = vi.fn()
    render(
      <WallComposer
        logo={null}
        deletesOn="2026-11-26"
        onSubmit={onSubmit}
        schedules={STORY_SCHEDULES}
        now={STORY_NOW}
      />,
    )
    await pickAgain(photo)
    return onSubmit
  }

  async function postedTalkId(onSubmit: ReturnType<typeof vi.fn>) {
    fireEvent.click(screen.getByRole('button', { name: 'Post to the wall' }))
    await waitFor(() => expect(bakes).toHaveLength(1))
    await act(async () =>
      bakes[0].resolve(new Blob(['x'], { type: 'image/jpeg' })),
    )
    return onSubmit.mock.calls[0][0].talkId
  }

  const tag = () => screen.getByTestId('talk-tag')
  const room = (name: string) => screen.getByRole('radio', { name })

  it('tags nothing until a room is chosen, then suggests its running talk', async () => {
    const onSubmit = await composeTagged('untagged')
    expect(tag()).toHaveTextContent(/Pick your room/)
    fireEvent.click(room('Main stage'))
    expect(tag()).toHaveTextContent(
      'Tag: Running Kubernetes on a fjord ferry (now in Main stage)',
    )
    expect(sessionStorage.getItem(ROOM_KEY)).toBe('Main stage')
    expect(await postedTalkId(onSubmit)).toBe('talk-a1')
  })

  it('keeps the last room for the next post', async () => {
    sessionStorage.setItem(ROOM_KEY, 'Workshop room')
    const onSubmit = await composeTagged('kept')
    expect(room('Workshop room')).toBeChecked()
    expect(tag()).toHaveTextContent('Tag: GitOps from scratch')
    expect(await postedTalkId(onSubmit)).toBe('talk-b1')
  })

  it('changes the talk to one of an earlier day', async () => {
    sessionStorage.setItem(ROOM_KEY, 'Main stage')
    const onSubmit = await composeTagged('changed')
    fireEvent.change(screen.getByLabelText('Change talk'), {
      target: { value: 'talk-d1' },
    })
    expect(tag()).toHaveTextContent('Tag: Opening keynote')
    expect(tag()).not.toHaveTextContent('now in')
    expect(await postedTalkId(onSubmit)).toBe('talk-d1')
  })

  it('No talk clears the tag', async () => {
    sessionStorage.setItem(ROOM_KEY, 'Main stage')
    const onSubmit = await composeTagged('cleared')
    fireEvent.click(screen.getByRole('button', { name: 'No talk' }))
    expect(tag()).toHaveTextContent('No talk tagged.')
    expect(await postedTalkId(onSubmit)).toBeNull()
  })

  it('shows no Talk row without a schedule, and posts untagged', async () => {
    const onSubmit = await compose('none')
    expect(screen.queryByTestId('talk-tag')).toBeNull()
    expect(await postedTalkId(onSubmit)).toBeNull()
  })
})
