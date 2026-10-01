/**
 * @vitest-environment jsdom
 *
 * #1249: picking a marketing asset whose Format the post's Channel crops
 * WARNS, naming the crop, and the pick still goes through. The warning lands
 * in a status region mounted for the slot's whole life, so it is announced.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { PLATFORM_CONSTRAINTS } from '@/lib/social/provider/constraints'
import { AttachmentSlot, type MarketingAssetPick } from './AttachmentSlot'

afterEach(cleanup)

const CROP =
  'LinkedIn posts go out cropped to 1.91:1, so this image loses about 48% of its height (top and bottom). Check the crop, or pick a landscape (1200×628) entry.'

const PICKS: MarketingAssetPick[] = [
  {
    id: 'a-landscape',
    title: 'Venue, wide',
    alt: 'The venue',
    thumbnailSrc: null,
    attachable: true,
    context: 'CND 2027',
    format: 'landscape',
    formatWarning: null,
  },
  {
    id: 'a-square',
    title: 'Logo',
    alt: 'The logo',
    thumbnailSrc: null,
    attachable: true,
    context: 'Whole organization',
    format: 'square',
    formatWarning: CROP,
  },
]

/** The image the pick put on the post, already selected on the variant. */
const PICKED = {
  _key: 'picked',
  assetId: 'image-0000000000000000000000000000000000000001-1080x1080-png',
  width: 1080,
  height: 1080,
  hotspot: null,
  crop: null,
  alt: 'The logo',
}

function slot(
  onPick: (asset: MarketingAssetPick) => Promise<void>,
  onChange: () => void = () => {},
) {
  render(
    <AttachmentSlot
      postAttachments={[PICKED]}
      attachments={[{ source: 'picked', crop: null, altOverride: null }]}
      constraints={PLATFORM_CONSTRAINTS.linkedin}
      imageSrc={() => ''}
      onChange={onChange}
      marketingAssets={{
        assets: PICKS,
        isLoading: false,
        search: '',
        onSearchChange: () => {},
        allEditions: false,
        onAllEditionsChange: () => {},
        onPick,
      }}
    />,
  )
  // Mounted before anything is picked, so its later text is announced.
  const status = screen.getByRole('status')
  expect(status).toHaveTextContent('')
  fireEvent.click(screen.getByRole('button', { name: 'Marketing assets' }))
  return { status }
}

const tile = (name: RegExp) =>
  within(screen.getByRole('group', { name: 'Marketing assets' })).getByRole(
    'button',
    { name },
  )

describe('AttachmentSlot: a Format the Channel crops (#1249)', () => {
  it('shows each entry its Format on the tile', () => {
    slot(async () => {})
    expect(tile(/Venue, wide/)).toHaveAccessibleName(
      'Add Venue, wide (CND 2027, landscape) to the post',
    )
    expect(tile(/Logo/)).toHaveTextContent('Square')
  })

  it('a mismatched pick goes through, then warns naming the crop', async () => {
    const onPick = vi.fn(async () => {})
    const { status } = slot(onPick)
    fireEvent.click(tile(/Logo/))
    await waitFor(() => expect(status).toHaveTextContent(`Added Logo. ${CROP}`))
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a-square' }),
    )
    // Not an error: nothing was refused.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('the warning goes when an image is removed: it no longer describes the post', async () => {
    const onChange = vi.fn()
    const { status } = slot(async () => {}, onChange)
    fireEvent.click(tile(/Logo/))
    await waitFor(() => expect(status).toHaveTextContent(`Added Logo.`))
    fireEvent.click(screen.getByRole('button', { name: 'Remove image 1' }))
    expect(onChange).toHaveBeenCalledWith([])
    expect(status).toHaveTextContent('')
  })

  it("a pick in the Channel's own Format adds without a warning", async () => {
    const onPick = vi.fn(async () => {})
    const { status } = slot(onPick)
    fireEvent.click(tile(/Venue, wide/))
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))
    // The picker closed: the pick finished, and still nothing was said.
    await waitFor(() =>
      expect(
        screen.queryByRole('group', { name: 'Marketing assets' }),
      ).toBeNull(),
    )
    expect(status).toHaveTextContent('')
  })

  it('a pick that failed warns about nothing: it shows the failure', async () => {
    const { status } = slot(async () => {
      throw new Error('That asset is gone.')
    })
    fireEvent.click(tile(/Logo/))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'That asset is gone.',
      ),
    )
    expect(status).toHaveTextContent('')
  })
})
