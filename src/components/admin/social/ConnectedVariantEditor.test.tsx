/**
 * @vitest-environment jsdom
 *
 * #1249, the editor's half: the picker asks the server for THIS variant's
 * ranking (the server reads its Channel), and a pick the Channel crops warns
 * with the platform's own words while the pick still goes through. The
 * server's order itself is pinned on executed GROQ in `sanity.groq.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type {
  SocialPostVariant,
  SocialVariantEditorData,
} from '@/lib/social/types'

const h = vi.hoisted(() => ({
  forPost: vi.fn(),
  addFromAsset: vi.fn(),
}))

vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))

/**
 * Every procedure the editor touches, benign by default: queries hold no
 * data, mutations resolve, utils invalidate. Only the picker's read and the
 * pick are observed.
 */
vi.mock('@/lib/trpc/client', () => {
  const procedure = (path: string[]): unknown =>
    new Proxy(() => {}, {
      get(_, key: string) {
        if (key === 'useQuery')
          return (input: unknown, options?: { enabled?: boolean }) =>
            path.join('.') === 'marketingAsset.forPost'
              ? h.forPost(input, options)
              : { data: undefined, isLoading: false, error: null }
        if (key === 'useMutation')
          return () => ({
            mutate: vi.fn(),
            mutateAsync:
              path.join('.') === 'social.addPostAttachmentFromAsset'
                ? h.addFromAsset
                : vi.fn(async () => ({ key: 'k' })),
            isPending: false,
          })
        if (key === 'invalidate') return vi.fn(async () => {})
        return procedure([...path, key])
      },
      apply: () => procedure(path),
    })
  return {
    api: new Proxy(
      {},
      {
        get: (_, key: string) =>
          key === 'useUtils' ? () => procedure([]) : procedure([key]),
      },
    ),
  }
})

import { ConnectedVariantEditor } from './ConnectedVariantEditor'

const variant = (
  platform: SocialPostVariant['platform'],
): SocialPostVariant => ({
  _id: 'variant-1',
  _rev: 'r1',
  postId: 'post-1',
  conferenceId: 'c-1',
  orgId: 'o-1',
  platform,
  body: 'Tickets are live',
  status: 'draft',
  scheduledAt: null,
  usesCustomTime: false,
  claimedAt: null,
  submission: null,
  shortCode: null,
  link: null,
  attachments: [],
  publishResult: null,
  attempts: [],
  attemptCount: 0,
})

const data = (
  platform: SocialPostVariant['platform'],
): SocialVariantEditorData => ({
  variant: variant(platform),
  post: { attachments: [], defaultScheduledAt: null },
  conferenceDomains: [],
  postedLink: null,
})

/** A row as the server sends it, already ranked. */
const row = (id: string, title: string, format: string) => ({
  _id: id,
  title,
  alt: `alt of ${title}`,
  kind: 'image',
  scope: 'organization',
  conferenceId: null,
  edition: null,
  subject: null,
  assetId: `image-${id}`,
  posterAssetId: null,
  attachable: true,
  studio: null,
  format,
})

beforeEach(() => {
  h.forPost.mockReset()
  h.forPost.mockReturnValue({
    data: [
      row('wide', 'Venue, wide', 'landscape'),
      row('logo', 'Logo', 'square'),
    ],
    isLoading: false,
    error: null,
  })
  h.addFromAsset.mockReset()
  h.addFromAsset.mockResolvedValue({ key: 'added' })
})
afterEach(cleanup)

const openPicker = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Marketing assets' }))
  return within(screen.getByRole('group', { name: 'Marketing assets' }))
}

describe('ConnectedVariantEditor: the picker ranks for this variant (#1249)', () => {
  it("asks the server for this variant's ranking, in the order it sends", () => {
    render(<ConnectedVariantEditor data={data('linkedin')} />)
    const picker = openPicker()
    expect(h.forPost).toHaveBeenLastCalledWith(
      expect.objectContaining({ postId: 'post-1', variantId: 'variant-1' }),
      expect.objectContaining({ enabled: true }),
    )
    expect(
      picker
        .getAllByRole('button', { name: /^Add / })
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Add Venue, wide (Whole organization, landscape) to the post',
      'Add Logo (Whole organization, square) to the post',
    ])
  })

  it('a square pick on LinkedIn goes through and warns about the 1.91:1 crop', async () => {
    render(<ConnectedVariantEditor data={data('linkedin')} />)
    fireEvent.click(openPicker().getByRole('button', { name: /^Add Logo/ }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Added Logo. LinkedIn posts go out cropped to 1.91:1, so this image loses its top and bottom.',
      ),
    )
    expect(h.addFromAsset).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'post-1', marketingAssetId: 'logo' }),
    )
  })

  it('the same square pick on Bluesky says nothing: square is its Format', async () => {
    render(<ConnectedVariantEditor data={data('bluesky')} />)
    fireEvent.click(openPicker().getByRole('button', { name: /^Add Logo/ }))
    await waitFor(() => expect(h.addFromAsset).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(
        screen.queryByRole('group', { name: 'Marketing assets' }),
      ).toBeNull(),
    )
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it("highlights only the Channel's own Format, and none for a Channel without one", () => {
    const preferred = () =>
      Object.fromEntries(
        within(screen.getByRole('group', { name: 'Marketing assets' }))
          .getAllByRole('listitem')
          .map((item) => [
            item.textContent?.match(/Venue|Logo/)?.[0],
            item
              .querySelector('[data-format-preferred]')
              ?.getAttribute('data-format-preferred'),
          ]),
      )
    const linkedin = render(<ConnectedVariantEditor data={data('linkedin')} />)
    openPicker()
    expect(preferred()).toEqual({ Venue: 'true', Logo: 'false' })
    linkedin.unmount()
    render(<ConnectedVariantEditor data={data('x')} />)
    openPicker()
    expect(preferred()).toEqual({ Venue: 'false', Logo: 'false' })
  })

  it('a 2:1 upload cropped to a square warns from the CROPPED shape: it loses its top and bottom', async () => {
    h.forPost.mockReturnValue({
      data: [
        {
          ...row('cropped', 'Cropped', 'square'),
          width: 2000,
          height: 1000,
          crop: { top: 0, bottom: 0, left: 0.25, right: 0.25 },
        },
      ],
      isLoading: false,
      error: null,
    })
    render(<ConnectedVariantEditor data={data('linkedin')} />)
    fireEvent.click(openPicker().getByRole('button', { name: /^Add Cropped/ }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Added Cropped. LinkedIn posts go out cropped to 1.91:1, so this image loses about 48% of its height (top and bottom).',
      ),
    )
  })

  it('a 2:1 studio card that reads as square warns from its pixels: it loses its sides', async () => {
    h.forPost.mockReturnValue({
      data: [
        {
          ...row('promo', 'Promo', 'square'),
          width: 2000,
          height: 1000,
          // Saved from the studio before Formats: judged by its Format.
          studio: { tab: 'promo', format: 'square' },
        },
      ],
      isLoading: false,
      error: null,
    })
    render(<ConnectedVariantEditor data={data('linkedin')} />)
    fireEvent.click(openPicker().getByRole('button', { name: /^Add Promo/ }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Added Promo. LinkedIn posts go out cropped to 1.91:1, so this image loses about 5% of its width (sides).',
      ),
    )
  })

  it('an upload ranked landscape still warns when LinkedIn crops away half of it; a 16:9 one is silent', async () => {
    h.forPost.mockReturnValue({
      data: [
        { ...row('banner', 'Banner', 'landscape'), width: 4000, height: 1000 },
        { ...row('photo', 'Photo', 'landscape'), width: 1600, height: 900 },
      ],
      isLoading: false,
      error: null,
    })
    render(<ConnectedVariantEditor data={data('linkedin')} />)
    fireEvent.click(openPicker().getByRole('button', { name: /^Add Banner/ }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Added Banner. LinkedIn posts go out cropped to 1.91:1, so this image loses about 52% of its width (sides).',
      ),
    )
    fireEvent.click(openPicker().getByRole('button', { name: /^Add Photo/ }))
    await waitFor(() => expect(h.addFromAsset).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(
        screen.queryByRole('group', { name: 'Marketing assets' }),
      ).toBeNull(),
    )
    expect(screen.getByRole('status')).toHaveTextContent('')
  })
})
