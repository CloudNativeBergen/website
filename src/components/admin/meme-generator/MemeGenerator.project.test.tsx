/**
 * @vitest-environment jsdom
 *
 * A video saved as a project (#1181), as the editor uses the injected store:
 * Save, the revision carried from save to save, a conflict, a background not
 * in the gallery, opening from the URL, Duplicate and the unsaved-changes
 * warning. What the server stores and refuses is videoProject.test's; the
 * round trip through the stored document is meme-generator-project.test's.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  onTestFinished,
} from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import type { MemeAssets, MemeDesign } from './meme-generator-draw'
import type { BackgroundGallery } from './meme-generator-gallery'
import { VideoProjectError, type VideoProjects } from './meme-generator-project'
import type {
  OpenedProject,
  OpenedScene,
  VideoProjectRow,
} from '@/lib/video-project'

const drawDesign =
  vi.fn<
    (ctx: unknown, design: MemeDesign, assets: MemeAssets, time: number) => void
  >()
vi.mock('./meme-generator-draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./meme-generator-draw')>()),
  drawDesign: (...args: [unknown, MemeDesign, MemeAssets, number]) =>
    drawDesign(...args),
}))

import { MemeGenerator } from './MemeGenerator'
import { DEFAULT_DESIGN } from './meme-generator-draw'

const HALL_URL = '/api/proxy-image?url=hall'

function openedScene(key: string, text: string): OpenedScene {
  return {
    key,
    duration: 4,
    transition: 'fade',
    motion: { drift: false, elements: [] },
    design: {
      ...structuredClone(DEFAULT_DESIGN),
      textLines: DEFAULT_DESIGN.textLines.map((l, i) =>
        i === 0 ? { ...l, text } : { ...l },
      ),
      background: {
        color: '#1D4ED8',
        image: {
          name: 'Keynote hall',
          fileId: 'image-hall',
          galleryAssetId: 'asset-hall',
          url: HALL_URL,
        },
      },
    },
  }
}

const PROJECT: OpenedProject = {
  _id: 'vp-1',
  _rev: 'rev-1',
  title: 'Launch teaser',
  scope: 'organization',
  edition: null,
  scenes: [openedScene('s-1', 'Hello'), openedScene('s-2', 'World')],
  track: null,
}

function fakeProjects(overrides: Partial<VideoProjects> = {}) {
  let rev = 1
  return {
    list: vi.fn(async () => [
      {
        _id: 'vp-1',
        title: 'Launch teaser',
        scope: 'organization' as const,
        edition: null,
        updatedAt: '2026-09-26T10:00:00Z',
        scenes: 2,
      },
    ]),
    open: vi.fn(async (id: string) => ({ ...PROJECT, _id: id })),
    create: vi.fn(async (input: Parameters<VideoProjects['create']>[0]) => ({
      _id: 'vp-new',
      _rev: `rev-${++rev}`,
      scenes: input.scenes.map((s) => ({ key: s.key, fileId: null })),
    })),
    save: vi.fn(async (input: Parameters<VideoProjects['save']>[0]) => ({
      _rev: `rev-${++rev}`,
      scenes: input.scenes.map((s) => ({
        key: s.key,
        fileId: s.design.background.image ? 'image-hall' : null,
      })),
      released: [],
    })),
    duplicate: vi.fn(async () => ({ _id: 'vp-copy' })),
    delete: vi.fn(async () => ({
      released: [] as string[],
      unsaveable: [] as string[],
    })),
    ...overrides,
  } satisfies VideoProjects
}

beforeEach(() => {
  // jsdom keeps one history across tests: start each on a plain entry.
  window.history.replaceState(null, '', window.location.href)
  drawDesign.mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as unknown as CanvasRenderingContext2D,
  )
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: () => Promise.resolve(),
  })
  onTestFinished(() => {
    Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const project = () => screen.getByRole('region', { name: 'Project' })
const toVideo = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Video' }))
const save = () =>
  fireEvent.click(within(project()).getByRole('button', { name: 'Save' }))
const typeTitle = (title: string) =>
  fireEvent.change(within(project()).getByLabelText('Project title'), {
    target: { value: title },
  })

describe('saving a video', () => {
  it('creates a project, then saves over it on the revision each save carried back', async () => {
    const projects = fakeProjects()
    const onProjectChange = vi.fn()
    render(
      <MemeGenerator projects={projects} onProjectChange={onProjectChange} />,
    )
    toVideo()
    typeTitle('Teaser')
    expect(within(project()).getByText('Not saved yet')).toBeInTheDocument()

    save()
    await within(project()).findByText('All changes saved')
    expect(projects.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Teaser', edition: 'none' }),
    )
    expect(onProjectChange).toHaveBeenLastCalledWith('vp-new')

    typeTitle('Teaser v2')
    expect(within(project()).getByText('Unsaved changes')).toBeInTheDocument()
    save()
    await within(project()).findByText('All changes saved')
    expect(projects.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'vp-new',
        rev: 'rev-2',
        title: 'Teaser v2',
      }),
    )

    typeTitle('Teaser v3')
    save()
    await within(project()).findByText('All changes saved')
    expect(projects.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'vp-new', rev: 'rev-3' }),
    )
  })

  it('saves a new project for this edition only when asked', async () => {
    const projects = fakeProjects()
    render(<MemeGenerator projects={projects} />)
    toVideo()
    fireEvent.click(within(project()).getByLabelText('For this edition only'))
    save()
    await within(project()).findByText('All changes saved')
    expect(projects.create).toHaveBeenCalledWith(
      expect.objectContaining({ edition: 'current' }),
    )
  })

  it('refuses a background that is not in the gallery, naming the scene, and sends nothing', async () => {
    const projects = fakeProjects()
    render(<MemeGenerator projects={projects} />)
    toVideo()
    fireEvent.change(screen.getByLabelText(/Upload Background Image/), {
      target: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] },
    })
    await screen.findByText('Current: photo.png')
    save()
    expect(await within(project()).findByRole('alert')).toHaveTextContent(
      "Scene 1's background is not in the gallery, so the project cannot be saved.",
    )
    expect(projects.create).not.toHaveBeenCalled()
  })

  it('says a save over a newer one conflicted, and offers to save it as a new project', async () => {
    const projects = fakeProjects({
      save: vi.fn(async () => {
        throw new VideoProjectError('conflict', true)
      }),
    })
    render(<MemeGenerator projects={projects} initialProjectId="vp-1" />)
    await screen.findByDisplayValue('Launch teaser')
    typeTitle('Mine')
    save()
    const alert = await within(project()).findByRole('alert')
    expect(alert).toHaveTextContent(
      'Someone saved this project after you opened it',
    )
    expect(within(project()).getByText('Unsaved changes')).toBeInTheDocument()

    // An edit after the conflict is part of what is saved as new.
    typeTitle('Mine, edited')
    fireEvent.click(
      within(project()).getByRole('button', { name: 'Save as a new project' }),
    )
    await within(project()).findByText('All changes saved')
    expect(projects.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mine, edited', copyFilesFrom: 'vp-1' }),
    )
  })
})

describe('opening a project', () => {
  it('opens the project the URL names in Video mode, drawing its backgrounds', async () => {
    const projects = fakeProjects()
    render(<MemeGenerator projects={projects} initialProjectId="vp-1" />)
    await screen.findByDisplayValue('Launch teaser')
    expect(projects.open).toHaveBeenCalledWith('vp-1')
    expect(screen.getByRole('button', { name: 'Video' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(project()).getByText('All changes saved')).toBeInTheDocument()
    await waitFor(() => {
      const [, design, assets] = drawDesign.mock.lastCall!
      expect(design.background.image).toMatchObject({
        url: HALL_URL,
        fileId: 'image-hall',
      })
      expect(assets.background).not.toBeNull()
    })
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  it('keeps the backgrounds it decoded when the video changes while it opens', async () => {
    const OTHER = '/api/proxy-image?url=other'
    const second = openedScene('s-2', 'World')
    second.design.background.image = {
      ...second.design.background.image!,
      url: OTHER,
    }
    const projects = fakeProjects({
      open: vi.fn(async () => ({
        ...PROJECT,
        scenes: [PROJECT.scenes[0], second],
      })),
    })
    // The first image decodes at once, the second only when released.
    let release: () => void = () => {}
    const late = new Promise<void>((resolve) => (release = resolve))
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value(this: HTMLImageElement) {
        return this.src.endsWith('other') ? late : Promise.resolve()
      },
    })
    render(<MemeGenerator projects={projects} initialProjectId="vp-1" />)
    await waitFor(() => expect(projects.open).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    // An edit lands after the first decoded, before the second: the history
    // moves on, and the prune runs.
    fireEvent.change(screen.getAllByPlaceholderText('Enter your text...')[0], {
      target: { value: 'typed meanwhile' },
    })
    release()
    await screen.findByDisplayValue('Launch teaser')
    await waitFor(() => {
      const [, design, assets] = drawDesign.mock.lastCall!
      expect(design.background.image?.url).toBe(HALL_URL)
      expect(assets.background).not.toBeNull()
    })
  })

  it('never lets an upload still decoding land in the project opened after it', async () => {
    const projects = fakeProjects()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MemeGenerator projects={projects} initialProjectId="vp-1" />)
    await screen.findByDisplayValue('Launch teaser')
    let release: () => void = () => {}
    const late = new Promise<void>((resolve) => (release = resolve))
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value(this: HTMLImageElement) {
        return this.src.startsWith('data:') ? late : Promise.resolve()
      },
    })
    fireEvent.change(screen.getByLabelText(/Upload Background Image/), {
      target: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] },
    })
    // Reopened — same scene keys — while the upload decodes.
    fireEvent.change(within(project()).getByLabelText('Open a saved project'), {
      target: { value: 'vp-1' },
    })
    await waitFor(() => expect(projects.open).toHaveBeenCalledTimes(2))
    await within(project()).findByText('All changes saved')
    release()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(within(project()).getByText('All changes saved')).toBeInTheDocument()
    expect(screen.queryByText('Current: photo.png')).toBeNull()
  })

  it('says plainly when a project cannot be opened', async () => {
    const projects = fakeProjects({
      open: vi.fn(async () => {
        throw new VideoProjectError(
          'This project was saved by a newer version of the studio (format 2) and cannot be opened here.',
        )
      }),
    })
    render(<MemeGenerator projects={projects} initialProjectId="vp-9" />)
    expect(await within(project()).findByRole('alert')).toHaveTextContent(
      'saved by a newer version of the studio',
    )
  })

  it('asks before an open throws away unsaved changes', async () => {
    const projects = fakeProjects()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MemeGenerator projects={projects} />)
    toVideo()
    typeTitle('Unsaved work')
    await within(project()).findByRole('option', { name: 'Launch teaser' })
    fireEvent.change(within(project()).getByLabelText('Open a saved project'), {
      target: { value: 'vp-1' },
    })
    expect(confirm).toHaveBeenCalled()
    expect(projects.open).not.toHaveBeenCalled()
  })
})

describe('duplicate', () => {
  it('copies the saved project and opens the copy', async () => {
    const projects = fakeProjects()
    const onProjectChange = vi.fn()
    render(
      <MemeGenerator
        projects={projects}
        initialProjectId="vp-1"
        onProjectChange={onProjectChange}
      />,
    )
    await screen.findByDisplayValue('Launch teaser')
    fireEvent.click(
      within(project()).getByRole('button', { name: /Duplicate/ }),
    )
    await waitFor(() =>
      expect(projects.open).toHaveBeenLastCalledWith('vp-copy'),
    )
    expect(projects.duplicate).toHaveBeenCalledWith('vp-1')
    await waitFor(() =>
      expect(onProjectChange).toHaveBeenLastCalledWith('vp-copy'),
    )
  })

  it('waits for unsaved changes to be saved first', async () => {
    const projects = fakeProjects()
    render(<MemeGenerator projects={projects} initialProjectId="vp-1" />)
    await screen.findByDisplayValue('Launch teaser')
    typeTitle('Changed')
    expect(
      within(project()).getByRole('button', { name: /Duplicate/ }),
    ).toBeDisabled()
  })
})

describe('leaving with unsaved changes', () => {
  const blocked = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('asks first, and not once the changes are saved', async () => {
    const projects = fakeProjects()
    render(<MemeGenerator projects={projects} />)
    toVideo()
    expect(blocked()).toBe(false)
    typeTitle('Teaser')
    expect(blocked()).toBe(true)
    save()
    await within(project()).findByText('All changes saved')
    // The listener goes in the effect after that commit.
    await waitFor(() => expect(blocked()).toBe(false))
  })

  it('asks before an in-app link leaves, and stays when told to', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <>
        <a href="/admin/speakers">Speakers</a>
        <MemeGenerator projects={fakeProjects()} />
      </>,
    )
    toVideo()
    const click = () => {
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
      })
      screen.getByRole('link', { name: 'Speakers' }).dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(click()).toBe(false)
    expect(confirm).not.toHaveBeenCalled()
    typeTitle('Teaser')
    expect(click()).toBe(true)
    expect(confirm).toHaveBeenCalled()
    confirm.mockReturnValue(true)
    expect(click()).toBe(false)
  })

  it('never asks for a download link, or a blob link', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <>
        <a href="/files/clip.mp4" download="clip.mp4">
          Download video
        </a>
        <MemeGenerator projects={fakeProjects()} />
      </>,
    )
    toVideo()
    typeTitle('Teaser')
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    })
    screen.getByRole('link', { name: 'Download video' }).dispatchEvent(event)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('still asks while a multi-scene video is previewed in Image mode', () => {
    render(<MemeGenerator projects={fakeProjects()} />)
    toVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }))
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    expect(blocked()).toBe(true)
  })

  it('still asks for a single scene whose length was changed, previewed as an image', async () => {
    render(<MemeGenerator projects={fakeProjects()} />)
    toVideo()
    const length = screen.getByRole('textbox', { name: 'Scene 1 length (s)' })
    fireEvent.change(length, { target: { value: '5' } })
    fireEvent.keyDown(length, { key: 'Enter' })
    fireEvent.blur(length)
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    await waitFor(() => expect(blocked()).toBe(true))
  })

  it('guards browser Back: stays when told to, and lets go once saved', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const projects = fakeProjects()
    render(<MemeGenerator projects={projects} />)
    toVideo()
    const depth = window.history.length
    typeTitle('Teaser')
    // A guard entry of the same URL sits on top.
    await waitFor(() => expect(window.history.length).toBe(depth + 1))
    expect(window.history.state).toMatchObject({ __studioLeaveGuard: true })
    window.history.back()
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    // Stayed: the guard is back on top.
    await waitFor(() =>
      expect(window.history.state).toMatchObject({ __studioLeaveGuard: true }),
    )
    // Saved: the guard comes off, so the next Back leaves at once.
    save()
    await within(project()).findByText('All changes saved')
    await waitFor(() =>
      expect(window.history.state?.__studioLeaveGuard).toBeUndefined(),
    )
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('leaves on browser Back when the organizer confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const back = vi.spyOn(window.history, 'back')
    render(<MemeGenerator projects={fakeProjects()} />)
    toVideo()
    typeTitle('Teaser')
    await waitFor(() =>
      expect(window.history.state).toMatchObject({ __studioLeaveGuard: true }),
    )
    window.history.back()
    // Ours goes back once more, past the page.
    await waitFor(() => expect(back).toHaveBeenCalledTimes(2))
  })

  it('never asks for an image with no project', () => {
    render(<MemeGenerator projects={fakeProjects()} />)
    fireEvent.change(screen.getAllByPlaceholderText(/text/i)[0], {
      target: { value: 'A meme' },
    })
    expect(blocked()).toBe(false)
  })
})

describe('behind another studio tab', () => {
  it('ignores the undo shortcut while hidden', () => {
    const { container } = render(
      <div hidden>
        <MemeGenerator projects={fakeProjects()} />
      </div>,
    )
    fireEvent.change(
      within(container).getAllByPlaceholderText('Enter your text...')[0],
      { target: { value: 'kept' } },
    )
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    expect(
      within(container).getAllByPlaceholderText('Enter your text...')[0],
    ).toHaveValue('kept')
  })
})

describe('playback behind another studio tab', () => {
  it('stops when the editor is hidden', async () => {
    const view = render(
      <div>
        <MemeGenerator projects={fakeProjects()} />
      </div>,
    )
    toVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    view.rerender(
      <div hidden>
        <MemeGenerator projects={fakeProjects()} />
      </div>,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Play', hidden: true }),
      ).toBeInTheDocument(),
    )
  })
})

describe('while a call is in flight', () => {
  it('locks the title and the edition choice until a save settles', async () => {
    let finish: () => void = () => {}
    const projects = fakeProjects({
      create: vi.fn(
        (input: Parameters<VideoProjects['create']>[0]) =>
          new Promise<Awaited<ReturnType<VideoProjects['create']>>>(
            (resolve) => {
              finish = () =>
                resolve({
                  _id: 'vp-new',
                  _rev: 'rev-2',
                  scenes: input.scenes.map((sc) => ({
                    key: sc.key,
                    fileId: null,
                  })),
                })
            },
          ),
      ),
    })
    render(<MemeGenerator projects={projects} />)
    toVideo()
    save()
    expect(within(project()).getByLabelText('Project title')).toHaveAttribute(
      'readonly',
    )
    expect(
      within(project()).getByLabelText('For this edition only'),
    ).toBeDisabled()
    finish()
    await within(project()).findByText('All changes saved')
  })

  it('makes the editor inert while a project opens, so no edit is lost to it', async () => {
    let finish: () => void = () => {}
    const projects = fakeProjects({
      open: vi.fn(
        () =>
          new Promise<OpenedProject>(
            (resolve) => (finish = () => resolve(PROJECT)),
          ),
      ),
    })
    const { container } = render(
      <MemeGenerator projects={projects} initialProjectId="vp-1" />,
    )
    await waitFor(() => expect(projects.open).toHaveBeenCalled())
    expect(container.firstElementChild).toHaveAttribute('inert')
    finish()
    await screen.findByDisplayValue('Launch teaser')
    expect(container.firstElementChild).not.toHaveAttribute('inert')
  })

  it('leaves Ctrl+Z in the title to the field', async () => {
    render(<MemeGenerator projects={fakeProjects()} />)
    toVideo()
    const title = within(project()).getByLabelText('Project title')
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    title.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('deleting a project', () => {
  it('asks in a dialog, deletes the open project, and leaves the video in the editor as unsaved', async () => {
    const projects = fakeProjects()
    const onProjectChange = vi.fn()
    render(
      <MemeGenerator
        projects={projects}
        initialProjectId="vp-1"
        onProjectChange={onProjectChange}
      />,
    )
    await screen.findByDisplayValue('Launch teaser')
    fireEvent.click(
      within(project()).getByRole('button', { name: 'Delete project' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(projects.delete).not.toHaveBeenCalled()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete project' }),
    )
    await waitFor(() => expect(projects.delete).toHaveBeenCalledWith('vp-1'))
    await waitFor(() => expect(onProjectChange).toHaveBeenLastCalledWith(null))
    await within(project()).findByText('Not saved yet')
    expect(screen.getByDisplayValue('Launch teaser')).toBeInTheDocument()
  })

  it('leaves the multi-scene video as the only, unsaved copy: leaving asks, and it saves again', async () => {
    const projects = fakeProjects({
      // The delete's orphan check took the background file.
      delete: vi.fn(async () => ({
        released: ['image-hall'],
        unsaveable: ['image-hall'],
      })),
    })
    render(<MemeGenerator projects={projects} initialProjectId="vp-1" />)
    await within(
      await screen.findByRole('region', { name: 'Project' }),
    ).findByText('All changes saved')
    fireEvent.click(
      within(project()).getByRole('button', { name: 'Delete project' }),
    )
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete project',
      }),
    )
    await within(project()).findByText('Not saved yet')
    // The editor holds the only copy now.
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    // No scene still draws the deleted file, in any state.
    await waitFor(() =>
      expect(drawDesign.mock.lastCall![1].background.image).toBeNull(),
    )
    save()
    await within(project()).findByText('All changes saved')
    const sent = vi.mocked(projects.create).mock.calls[0][0]
    expect(sent.scenes).toHaveLength(2)
    expect(sent.scenes.every((sc) => sc.design.background.image === null)).toBe(
      true,
    )
  })

  it('asks before leaving even when the delete took no file', async () => {
    render(<MemeGenerator projects={fakeProjects()} initialProjectId="vp-1" />)
    await within(
      await screen.findByRole('region', { name: 'Project' }),
    ).findByText('All changes saved')
    fireEvent.click(
      within(project()).getByRole('button', { name: 'Delete project' }),
    )
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete project',
      }),
    )
    await within(project()).findByText('Not saved yet')
    await waitFor(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    })
  })

  it('clears a background only the deleted project authorized, says so, and saves again', async () => {
    const projects = fakeProjects({
      // The file survives (something else holds it), but its gallery entry
      // is gone: nothing can authorize saving it again.
      delete: vi.fn(async () => ({
        released: [] as string[],
        unsaveable: ['image-hall'],
      })),
    })
    render(<MemeGenerator projects={projects} initialProjectId="vp-1" />)
    await within(
      await screen.findByRole('region', { name: 'Project' }),
    ).findByText('All changes saved')
    fireEvent.click(
      within(project()).getByRole('button', { name: 'Delete project' }),
    )
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete project',
      }),
    )
    // Shown, and announced.
    expect(
      await within(project()).findAllByText(
        /2 backgrounds were only in that project/,
      ),
    ).not.toHaveLength(0)
    save()
    await within(project()).findByText('All changes saved')
    const sent = vi.mocked(projects.create).mock.calls[0][0]
    expect(sent.scenes.every((sc) => sc.design.background.image === null)).toBe(
      true,
    )
  })

  it('does nothing when the dialog is cancelled', async () => {
    const projects = fakeProjects()
    render(<MemeGenerator projects={projects} initialProjectId="vp-1" />)
    await screen.findByDisplayValue('Launch teaser')
    fireEvent.click(
      within(project()).getByRole('button', { name: 'Delete project' }),
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/ }))
    expect(projects.delete).not.toHaveBeenCalled()
  })
})

describe('undo after a save deleted a background', () => {
  it('never brings the deleted image back: that scene undoes to its colour', async () => {
    const projects = fakeProjects({
      // As the server does: the file is released only once no scene holds it.
      save: vi.fn(async (input: Parameters<VideoProjects['save']>[0]) => ({
        _rev: 'rev-9',
        scenes: input.scenes.map((sc) => ({ key: sc.key, fileId: null })),
        released: input.scenes.some((sc) => sc.design.background.image)
          ? []
          : ['image-hall'],
      })),
      open: vi.fn(async () => ({ ...PROJECT, scenes: [PROJECT.scenes[0]] })),
    })
    render(<MemeGenerator projects={projects} initialProjectId="vp-1" />)
    await within(
      await screen.findByRole('region', { name: 'Project' }),
    ).findByText('All changes saved')
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear background image' }),
    )
    await waitFor(() =>
      expect(drawDesign.mock.lastCall![1].background.image).toBeNull(),
    )
    save()
    await within(project()).findByText('All changes saved')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(screen.queryByText('Current: Keynote hall')).toBeNull(),
    )
    expect(drawDesign.mock.lastCall![1].background.image).toBeNull()
  })
})

describe('after a conflict', () => {
  it('stays unsaved even once the local edit is undone, and offers no Duplicate of the newer save', async () => {
    const projects = fakeProjects({
      save: vi.fn(async () => {
        throw new VideoProjectError('conflict', true)
      }),
    })
    render(<MemeGenerator projects={projects} initialProjectId="vp-1" />)
    await screen.findByDisplayValue('Launch teaser')
    typeTitle('Mine')
    save()
    await within(project()).findByRole('alert')
    typeTitle('Launch teaser')
    expect(within(project()).getByText('Unsaved changes')).toBeInTheDocument()
    expect(
      within(project()).getByRole('button', { name: /Duplicate project/ }),
    ).toBeDisabled()
  })
})

describe('the saved-project list', () => {
  it('is latest-wins: an older list still in flight never replaces the refresh after a save', async () => {
    let settleOld: (rows: VideoProjectRow[]) => void = () => {}
    const fresh: VideoProjectRow[] = [
      {
        _id: 'vp-new',
        title: 'Brand new',
        scope: 'organization',
        edition: null,
        updatedAt: '2026-09-27T10:00:00Z',
        scenes: 1,
      },
    ]
    const list = vi
      .fn<VideoProjects['list']>()
      .mockImplementationOnce(
        () => new Promise((resolve) => (settleOld = resolve)),
      )
      .mockResolvedValue(fresh)
    render(<MemeGenerator projects={fakeProjects({ list })} />)
    toVideo()
    save()
    await within(project()).findByText('All changes saved')
    await within(project()).findByRole('option', { name: 'Brand new' })
    // The mount-time list lands last, with no new project in it.
    settleOld([])
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(
      within(project()).getByRole('option', { name: 'Brand new' }),
    ).toBeInTheDocument()
  })
})

describe('without a project store', () => {
  it('shows no project controls', () => {
    const gallery: BackgroundGallery | undefined = undefined
    render(<MemeGenerator gallery={gallery} />)
    toVideo()
    expect(screen.queryByRole('region', { name: 'Project' })).toBeNull()
  })
})
