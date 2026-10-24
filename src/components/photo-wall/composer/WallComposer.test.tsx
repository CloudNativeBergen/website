/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WallComposer } from './WallComposer'

const decodes = vi.hoisted(
  () => new Map<string, (master: HTMLCanvasElement) => void>(),
)

vi.mock('@/lib/photo-wall/photo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/photo-wall/photo')>()),
  decodeWallPhoto: (file: File) =>
    new Promise<HTMLCanvasElement>((resolve) =>
      decodes.set(file.name, resolve),
    ),
}))

// The editor and the strip paint on a canvas, which jsdom has not got: show
// which photo they were handed instead.
vi.mock('./PolaroidEditor', () => ({
  PolaroidEditor: ({ master }: { master: HTMLCanvasElement }) => (
    <p>editing {master.dataset.photo}</p>
  ),
}))
vi.mock('./FilterStrip', () => ({ FilterStrip: () => null }))

function canvasFor(photo: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.dataset.photo = photo
  return canvas
}

describe('WallComposer', () => {
  it('keeps the photo picked last when an earlier one finishes opening after it', async () => {
    render(
      <WallComposer logo={null} deletesOn="2026-11-26" onSubmit={vi.fn()} />,
    )
    const choose = screen.getByLabelText('Choose from your photos')
    fireEvent.change(choose, { target: { files: [new File(['a'], 'a.jpg')] } })
    fireEvent.change(choose, { target: { files: [new File(['b'], 'b.jpg')] } })

    await act(async () => decodes.get('b.jpg')?.(canvasFor('b')))
    await act(async () => decodes.get('a.jpg')?.(canvasFor('a')))

    expect(screen.getByText(/^editing /)).toHaveTextContent('editing b')
  })
})
