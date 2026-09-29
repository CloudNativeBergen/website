/**
 * @vitest-environment jsdom
 *
 * Round 4, T4: a screen-reader user hears the tag check START ("Checking…")
 * and hears it FINISH. The announcement lives in ONE status region that is
 * mounted for the whole life of the view: a region inserted at the same
 * moment as its text is unreliably announced, and one that is removed
 * announces nothing at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SocialPostVariant } from '@/lib/social/types'
import { ManualPostView } from './ManualPostView'

const variant: SocialPostVariant = {
  _id: 'v-1',
  _rev: 'r1',
  postId: 'p-1',
  conferenceId: 'c-1',
  orgId: 'o-1',
  platform: 'bluesky',
  body: 'Hello @alice.dev',
  status: 'awaiting-manual',
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
}

afterEach(cleanup)

describe('ManualPostView — the tag check is announced start to finish', () => {
  it('one status region, present throughout, says checking and then ready', () => {
    const view = (
      manualBody: Parameters<typeof ManualPostView>[0]['manualBody'],
    ) => (
      <ManualPostView
        variant={variant}
        postedLink={null}
        postAttachments={[]}
        onMarkPosted={vi.fn()}
        manualBody={manualBody}
      />
    )
    const { rerender } = render(view({ checking: true }))
    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(/checking/i)

    rerender(
      view({
        body: 'Hello Alice Smith',
        untagged: ['Alice Smith'],
        removed: 0,
      }),
    )
    // The SAME node, now saying the text is ready.
    expect(screen.getByRole('status')).toBe(status)
    expect(status.textContent).toMatch(/ready to copy/i)
  })
})

describe('ManualPostView — the link a reader sees is the short link (short-links spec §2.3)', () => {
  const SHORT = 'https://cndn.test/go/abc987'
  const LONG =
    'https://cndn.test/program?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=t'
  const coded = (body: string): SocialPostVariant => ({
    ...variant,
    body,
    link: LONG,
    shortCode: 'abc987',
  })
  const show = (body: string) =>
    render(
      <ManualPostView
        variant={coded(body)}
        postedLink={SHORT}
        postAttachments={[]}
        onMarkPosted={vi.fn()}
      />,
    )

  it('does not append a second link when the body already holds the short URL', () => {
    show(`See the program: ${SHORT}`)
    // 17 + 27 characters: the body alone, no link added.
    expect(screen.getByText(/^44 \/ 300$/)).toBeTruthy()
    expect(screen.queryByText(/The link is added at the end/)).toBeNull()
  })

  it('appends the SHORT link, and counts it, when the body has none', () => {
    show('Hi')
    // "Hi" + a blank line + the 27-character short link.
    expect(
      screen.getByText(/^31 \/ 300 · The link is added at the end\.$/),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: SHORT })).toBeTruthy()
    // The long link is the destination shown under it, never the copy.
    expect(
      screen.getByRole('button', { name: /copy text/i }).closest('section')!
        .textContent,
    ).not.toContain('utm_')
  })

  it('does not append the short link when the body holds it on a since-dropped domain (review P2)', () => {
    show('Old host: https://cnb-old.example/go/abc987')
    expect(screen.queryByText(/The link is added at the end/)).toBeNull()
  })

  it('copies the CURRENT short link in place of one on a since-dropped domain (review)', () => {
    show('Old host: https://cnb-old.example/go/abc987 !')
    const text = screen
      .getByRole('button', { name: /copy text/i })
      .closest('section')!.textContent
    expect(text).toContain(`Old host: ${SHORT} !`)
    expect(text).not.toContain('cnb-old.example')
  })

  it('shows where the short link goes, under it (review P2)', () => {
    show('Hi')
    expect(screen.getByTestId('manual-link-destination').textContent).toBe(LONG)
  })

  it('does not append the short link to copy that already holds the long one', () => {
    show(`From before short links: ${LONG}`)
    expect(screen.queryByText(/The link is added at the end/)).toBeNull()
  })
})

describe('ManualPostView — GIFs and videos from the gallery (#1167)', () => {
  const media = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `m-${i}`,
      title: `Clip ${i}`,
      kind: (i % 2 ? 'gif' : 'video') as 'gif' | 'video',
      alt: `Alt of clip ${i}`,
      context: 'Whole organization',
      thumbnailSrc: null,
      downloadUrl:
        i % 2
          ? `/api/admin/marketing-assets/original?asset=m-${i}`
          : `https://cdn.sanity.io/files/p/d/m-${i}.mp4?dl=clip-${i}.mp4`,
    }))
  const view = (
    galleryMedia: Parameters<typeof ManualPostView>[0]['galleryMedia'],
    status: SocialPostVariant['status'] = 'awaiting-manual',
  ) =>
    render(
      <ManualPostView
        variant={{ ...variant, status }}
        postedLink={null}
        postAttachments={[]}
        onMarkPosted={vi.fn()}
        galleryMedia={galleryMedia}
      />,
    )

  it('offers each ORIGINAL file to download, with its alt text to copy', () => {
    view(media(2))
    const video = screen.getByRole('link', {
      name: 'Download original video: Clip 0',
    })
    expect(video.getAttribute('href')).toBe(
      'https://cdn.sanity.io/files/p/d/m-0.mp4?dl=clip-0.mp4',
    )
    expect(video.hasAttribute('download')).toBe(true)
    expect(
      screen
        .getByRole('link', { name: 'Download original GIF: Clip 1' })
        .getAttribute('href'),
    ).toBe('/api/admin/marketing-assets/original?asset=m-1')
    expect(
      screen.getByRole('button', { name: 'Copy alt text of Clip 1' }),
    ).toBeTruthy()
    expect(screen.getByText(/can't be attached to a post yet/)).toBeTruthy()
  })

  it('shows three, then all on request', () => {
    view(media(5))
    expect(
      screen.getAllByRole('link', { name: /Download original/ }),
    ).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 5' }))
    expect(
      screen.getAllByRole('link', { name: /Download original/ }),
    ).toHaveLength(5)
  })

  it('says so when the gallery could not be read, and shows nothing when empty', () => {
    view('error')
    expect(
      screen.getByText("The gallery's GIFs and videos could not be loaded."),
    ).toBeTruthy()
    cleanup()
    view([])
    expect(screen.queryByText(/GIFs and videos from the gallery/)).toBeNull()
  })

  it('offers nothing once the post is recorded', () => {
    view(media(1), 'published')
    expect(screen.queryByRole('link', { name: /Download original/ })).toBeNull()
  })
})

describe('ManualPostView — while the gallery is read (#1167)', () => {
  it('says it is looking, rather than showing nothing', () => {
    render(
      <ManualPostView
        variant={variant}
        postedLink={null}
        postAttachments={[]}
        onMarkPosted={vi.fn()}
        galleryMedia="loading"
      />,
    )
    expect(
      screen.getByText(/Looking for GIFs and videos in the gallery/),
    ).toBeTruthy()
  })
})
