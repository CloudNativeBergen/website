/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AssetUploadForm } from './AssetUploadForm'

/** `createImageBitmap` resolved by hand, so the test decides the order. */
const reads = new Map<
  string,
  (size: { width: number; height: number }) => void
>()
beforeEach(() => {
  reads.clear()
  vi.stubGlobal(
    'createImageBitmap',
    (file: File) =>
      new Promise((resolve) =>
        reads.set(file.name, (size) => resolve({ ...size, close() {} })),
      ),
  )
  let n = 0
  URL.createObjectURL = vi.fn(() => `blob:preview-${++n}`)
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const png = (name: string, size = 1000) =>
  new File([new Uint8Array(size)], name, { type: 'image/png' })

function renderForm() {
  const uploader = vi.fn(async () => ({ _id: 'x', softOnSocial: false }))
  render(<AssetUploadForm uploader={uploader} onSaved={() => {}} />)
  const input = screen.getByLabelText(/Choose an image|Replace the image/)
  const pick = (file: File) =>
    act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
  const settle = (name: string, width: number, height: number) =>
    act(async () => reads.get(name)!({ width, height }))
  return { uploader, pick, settle, input }
}

describe('picking a file', () => {
  it('keeps the LATEST pick when an earlier file’s size read lands last', async () => {
    const { pick, settle } = renderForm()
    await pick(png('first.png'))
    await pick(png('second.png'))
    await settle('second.png', 1200, 1200)
    await settle('first.png', 500, 500)
    expect(screen.getByText('second.png')).toBeTruthy()
    expect(screen.queryByText('first.png')).toBeNull()
    expect(screen.getByText('· 1200 × 1200')).toBeTruthy()
    // The stale file's warning never shows.
    expect(screen.queryByText(/May look soft on social/)).toBeNull()
  })

  it('drops the earlier image when a refused file replaces it, so it cannot be saved by mistake', async () => {
    const { pick, settle, uploader } = renderForm()
    await pick(png('logo.png'))
    await settle('logo.png', 1200, 1200)
    fireEvent.change(screen.getByLabelText('Alt text'), {
      target: { value: 'The logo' },
    })
    await pick(new File(['GIF89a'], 'anim.gif', { type: 'image/gif' }))
    expect(screen.getByRole('alert').textContent).toBe(
      'Only PNG, JPEG and WebP images can be added.',
    )
    expect(screen.queryByText('logo.png')).toBeNull()
    const add = screen.getByRole('button', { name: 'Add to gallery' })
    expect((add as HTMLButtonElement).disabled).toBe(true)
    fireEvent.submit(add.closest('form')!)
    expect(uploader).not.toHaveBeenCalled()
  })

  it('replaces a title it filled in itself, and keeps one the organizer wrote', async () => {
    const { pick, settle } = renderForm()
    await pick(png('first-logo.png'))
    await settle('first-logo.png', 1200, 1200)
    const title = screen.getByLabelText('Title') as HTMLInputElement
    expect(title.value).toBe('first logo')
    await pick(png('second-logo.png'))
    await settle('second-logo.png', 1200, 1200)
    expect(title.value).toBe('second logo')
    fireEvent.change(title, { target: { value: 'Our logo' } })
    await pick(png('third.png'))
    await settle('third.png', 1200, 1200)
    expect(title.value).toBe('Our logo')
  })

  it('keeps an accessible name on the file input once a preview replaces the prompt', async () => {
    const { pick, settle } = renderForm()
    await pick(png('logo.png'))
    await settle('logo.png', 1200, 1200)
    expect(
      screen.getByLabelText('Replace the image').getAttribute('type'),
    ).toBe('file')
  })

  it('takes a dropped image instead of letting the browser navigate away', async () => {
    renderForm()
    const zone = screen.getByTestId('asset-dropzone')
    const file = png('dropped.png')
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.assign(drop, { dataTransfer: { files: [file] } })
    await act(async () => {
      zone.dispatchEvent(drop)
    })
    expect(drop.defaultPrevented).toBe(true)
    await act(async () =>
      reads.get('dropped.png')!({ width: 1200, height: 1200 }),
    )
    expect(screen.getByText('dropped.png')).toBeTruthy()
  })

  it('ignores a drop while an image is being saved', async () => {
    const { pick, settle, uploader } = renderForm()
    let finish: (value: {
      _id: string
      softOnSocial: boolean
    }) => void = () => {}
    uploader.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    )
    await pick(png('logo.png'))
    await settle('logo.png', 1200, 1200)
    fireEvent.change(screen.getByLabelText('Alt text'), {
      target: { value: 'The logo' },
    })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Add to gallery' }))
    })
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.assign(drop, { dataTransfer: { files: [png('late.png')] } })
    await act(async () => {
      screen.getByTestId('asset-dropzone').dispatchEvent(drop)
    })
    expect(reads.has('late.png')).toBe(false)
    expect(screen.getByText('logo.png')).toBeTruthy()
    await act(async () => finish({ _id: 'x', softOnSocial: false }))
    expect(uploader).toHaveBeenCalledTimes(1)
  })

  it('does not pull focus back from elsewhere when a slow save finishes', async () => {
    const { pick, settle, uploader } = renderForm()
    const elsewhere = document.createElement('button')
    document.body.appendChild(elsewhere)
    let finish: (value: {
      _id: string
      softOnSocial: boolean
    }) => void = () => {}
    uploader.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    )
    await pick(png('logo.png'))
    await settle('logo.png', 1200, 1200)
    fireEvent.change(screen.getByLabelText('Alt text'), {
      target: { value: 'The logo' },
    })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Add to gallery' }))
    })
    elsewhere.focus()
    await act(async () => finish({ _id: 'x', softOnSocial: false }))
    // The save finished and the form reset: the effect had its chance.
    expect(screen.getByLabelText('Choose an image')).toBeTruthy()
    expect(document.activeElement).toBe(elsewhere)
    elsewhere.remove()
  })

  it('puts focus on the picker after a save when focus had nowhere to go', async () => {
    const { pick, settle } = renderForm()
    await pick(png('logo.png'))
    await settle('logo.png', 1200, 1200)
    fireEvent.change(screen.getByLabelText('Alt text'), {
      target: { value: 'The logo' },
    })
    ;(document.activeElement as HTMLElement | null)?.blur()
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Add to gallery' }))
    })
    expect(document.activeElement).toBe(
      screen.getByLabelText('Choose an image'),
    )
  })

  it('locks the title and alt text while saving, so an edit is not silently lost', async () => {
    const { pick, settle, uploader } = renderForm()
    let finish: (value: {
      _id: string
      softOnSocial: boolean
    }) => void = () => {}
    uploader.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    )
    await pick(png('logo.png'))
    await settle('logo.png', 1200, 1200)
    fireEvent.change(screen.getByLabelText('Alt text'), {
      target: { value: 'The logo' },
    })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Add to gallery' }))
    })
    const title = screen.getByLabelText('Title') as HTMLInputElement
    const alt = screen.getByLabelText('Alt text') as HTMLTextAreaElement
    expect(title.readOnly).toBe(true)
    expect(alt.readOnly).toBe(true)
    // Not disabled: a browser moves focus off a disabled field, so a keyboard
    // user who submitted with Enter would lose their place if the save fails.
    expect(title.disabled).toBe(false)
    expect(alt.disabled).toBe(false)
    await act(async () => finish({ _id: 'x', softOnSocial: false }))
    expect(alt.readOnly).toBe(false)
  })

  it('cannot save the old image while a replacement is still being read', async () => {
    const { pick, settle, uploader } = renderForm()
    await pick(png('old.png'))
    await settle('old.png', 1200, 1200)
    fireEvent.change(screen.getByLabelText('Alt text'), {
      target: { value: 'The logo' },
    })
    // The replacement is picked; its size read has not landed yet.
    await pick(png('new.png'))
    expect(screen.queryByText('old.png')).toBeNull()
    const add = screen.getByRole('button', { name: 'Add to gallery' })
    expect((add as HTMLButtonElement).disabled).toBe(true)
    await act(async () => {
      fireEvent.submit(add.closest('form')!)
    })
    expect(uploader).not.toHaveBeenCalled()
    await settle('new.png', 1200, 1200)
    await act(async () => {
      fireEvent.submit(add.closest('form')!)
    })
    expect((uploader.mock.calls[0] as unknown as [File])[0].name).toBe(
      'new.png',
    )
  })
})
