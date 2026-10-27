/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { WallPagePost } from '@/lib/photo-wall/wall'
import { TalkPhotoRow } from './TalkPhotos'

const post = (i: number): WallPagePost => ({
  _id: `post-${i}`,
  src: `/sq${i}.jpg`,
  whole: { src: `/whole${i}.jpg`, width: 800, height: 600 },
  caption: i === 0 ? 'Keynote stage' : null,
  name: i === 0 ? 'Kari' : null,
  approvedAt: '2026-10-26T10:00:00Z',
})

describe('TalkPhotoRow (talk photos spec §7.1)', () => {
  it('renders nothing without photos', () => {
    const { container } = render(
      <TalkPhotoRow view={{ posts: [], count: 0 }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the photos, the count and a link to the wall', () => {
    render(
      <TalkPhotoRow
        view={{ posts: Array.from({ length: 6 }, (_, i) => post(i)), count: 9 }}
      />,
    )
    expect(screen.getByText('Photos from this talk (9)')).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(6)
    expect(screen.getByRole('img', { name: 'Keynote stage' })).toHaveAttribute(
      'src',
      '/sq0.jpg',
    )
    expect(
      screen.getAllByRole('img', { name: 'Photo from this talk' }),
    ).toHaveLength(5)
    expect(
      screen.getByRole('link', { name: 'See all on the Photo Wall' }),
    ).toHaveAttribute('href', '/wall')
  })

  it('opens the whole photo with its caption and name', async () => {
    render(<TalkPhotoRow view={{ posts: [post(0)], count: 1 }} />)
    fireEvent.click(screen.getByRole('button'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('img')).toHaveAttribute(
      'src',
      '/whole0.jpg',
    )
    expect(within(dialog).getByText('Kari')).toBeInTheDocument()
  })
})
