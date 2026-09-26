// @vitest-environment jsdom
/**
 * The two studio tabs whose card lives in its own wrapper (#1164): each hands
 * its preview to DownloadableImage as a studio card of its tab.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@/components/common/DownloadableImage', () => ({
  DownloadableImage: ({
    children,
    studio,
  }: {
    children: ReactNode
    studio?: unknown
  }) => (
    <div data-testid="card" data-studio={JSON.stringify(studio ?? null)}>
      {children}
    </div>
  ),
}))
vi.mock('./meme-generator/MemeGenerator', () => ({
  MemeGenerator: ({
    wrapPreview,
  }: {
    wrapPreview: (node: ReactNode) => ReactNode
  }) => wrapPreview(<p>meme</p>),
}))
vi.mock('./PhotoGalleryBuilder', () => ({
  PhotoGalleryBuilder: ({
    wrapPreview,
  }: {
    wrapPreview: (node: ReactNode) => ReactNode
  }) => wrapPreview(<p>collage</p>),
}))

import { MemeGeneratorWithDownload } from './meme-generator/MemeGeneratorWithDownload'
import { PhotoGalleryWithDownload } from './PhotoGalleryWithDownload'

afterEach(cleanup)

const studio = () =>
  JSON.parse(screen.getByTestId('card').getAttribute('data-studio')!)

describe('studio wrappers', () => {
  it('the free-form editor is a meme-generator card with no subject and nothing prefilled', () => {
    render(<MemeGeneratorWithDownload conferenceTitle="CND" />)
    expect(studio()).toEqual({ tab: 'meme-generator', title: '' })
  })

  it('the photo collage is a photo-gallery card with a title and no subject', () => {
    render(<PhotoGalleryWithDownload photos={[]} conferenceTitle="CND 2026" />)
    expect(studio()).toEqual({
      tab: 'photo-gallery',
      title: 'CND 2026 photo collage',
    })
  })
})
