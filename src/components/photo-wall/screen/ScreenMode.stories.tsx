import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useEffect, useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import type { ConferenceLogoData } from '@/lib/conference/logo'
import type { ScreenPost, ScreenView } from '@/lib/photo-wall/screen'
import type { WallLook } from '@/lib/photo-wall/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { STORY_PHOTOS, storyPhoto } from '../story-photos'
import { ScreenBoard, type ScreenPoll } from './ScreenBoard'
import { ScreenError } from './ScreenError'

const PHOTOS = [
  STORY_PHOTOS.landscape,
  STORY_PHOTOS.portrait,
  STORY_PHOTOS.photo,
  STORY_PHOTOS.panorama,
  STORY_PHOTOS.tall,
]
const CAPTIONS = [
  'kubectl apply -f joy',
  'Best keynote of the year!',
  null,
  'Hello from the eBPF room',
  'Fjord views between talks, and the longest caption a phone allows',
  'Waffles > YAML',
  null,
  'Hallway track is the best track',
  'That demo actually worked',
]
const NAMES = ['Ingrid', null, 'Lars B.', 'Platform team', null, 'Ahmed']

/** Approved `n` minutes after 07:00 on the first day: deterministic ids and times. */
const at = (minutes: number) =>
  new Date(Date.parse('2026-10-26T07:00:00Z') + minutes * 60_000).toISOString()
const post = (n: number): ScreenPost => ({
  _id: `wallPost-${n}`,
  ...storyPhoto(PHOTOS[n % PHOTOS.length]),
  caption: CAPTIONS[n % CAPTIONS.length],
  name: NAMES[n % NAMES.length],
  approvedAt: at(n),
})
/** `count` posts, newest approval first, as the server answers. */
const posts = (count: number) =>
  Array.from({ length: count }, (_, i) => post(count - i))
const view = (
  list: ScreenPost[],
  fields: Partial<ScreenView> = {},
): ScreenView => ({
  closed: false,
  sponsorStrip: false,
  look: 'pinboard',
  posts: list,
  ...fields,
})

/** One step of a scripted poll: the answer, or a failure, `after` ms from the last. */
interface Step {
  after: number
  answer?: ScreenView
  fail?: boolean
}

/**
 * Plays a script of polls into `ScreenBoard`, as React Query would: a step
 * with an answer bumps `dataUpdatedAt`, a failed one `errorUpdatedAt`.
 */
function Scripted({
  initial,
  script = [],
  sponsors = [],
  look,
  logo = { title: 'Cloud Native Days Norway' },
}: {
  initial: ScreenView
  script?: Step[]
  sponsors?: ConferenceSponsor[]
  /** The screen link's `?look=`. */
  look?: WallLook
  logo?: ConferenceLogoData
}) {
  const [poll, setPoll] = useState<ScreenPoll>(() => ({
    data: initial,
    dataUpdatedAt: Date.now(),
    errorUpdatedAt: 0,
  }))
  useEffect(() => {
    let delay = 0
    const timers = script.map((step) => {
      delay += step.after
      return setTimeout(() => {
        setPoll((p) =>
          step.fail
            ? { ...p, errorUpdatedAt: Date.now() }
            : { ...p, data: step.answer ?? p.data, dataUpdatedAt: Date.now() },
        )
      }, delay)
    })
    return () => timers.forEach(clearTimeout)
  }, [script])
  return (
    <ScreenBoard
      poll={poll}
      conference={{
        logo,
        postUrl: 'https://2026.cloudnativedays.no/wall/post',
        sponsors,
      }}
      look={look}
    />
  )
}

const meta = {
  title: 'Systems/PhotoWall/ScreenMode',
  component: Scripted,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'responsive' },
    docs: {
      description: {
        component:
          'Screen Mode `/wall/screen` (Photo Wall spec §9.2–§9.4), slices M5b, P3 and P4: the wall\'s look (**Pinboard**, **Mosaic** or **Spotlight**, or the screen link\'s `?look=`) on a 1920×1080 canvas scaled to the display, always dark by its own `dark` class (the global `theme` toolbar changes nothing), the conference logo and brand accent, up to 17 tilted polaroids, the QR polaroid pointing at the Composer, the "new" mark on an arrival, the offline dot, the sponsor strip, the empty and closed states. The stories play a script of polls into the board; on the site `photoWallPublic.screen` is polled every 5 s. Capture at 1920×1080 (`pnpm shoot <id> 1920 1080`).',
      },
    },
  },
  args: { initial: view(posts(24)) },
} satisfies Meta<typeof Scripted>

export default meta
type Story = StoryObj<typeof meta>

const cardsOf = (canvas: ReturnType<typeof within>) =>
  canvas.queryAllByTestId('wall-card')

/** 24 approved posts: the newest 17 on the board, the rest swapped in every 6 s. */
export const Pinboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(cardsOf(canvas)).toHaveLength(17), {
      timeout: 5_000,
    })
    // The QR is drawn asynchronously.
    await expect(
      await canvas.findByRole('img', { name: /QR code for/ }),
    ).toBeVisible()
    await expect(canvasElement.querySelector('.dark')).not.toBeNull()
    await expect(canvas.queryByRole('status')).toBeNull()
  },
}

/** A post approved 1 s after the screen opened: drops in on top with its "new" mark. */
export const Arrival: Story = {
  args: {
    initial: view(posts(17)),
    script: [{ after: 1_000, answer: view([post(30), ...posts(17)]) }],
  },
  play: async ({ canvasElement }) => {
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector('[data-new][data-post="wallPost-30"]'),
        ).not.toBeNull(),
      { timeout: 5_000 },
    )
  },
}

/** Five approvals at once: one every 2.5 s, in approval order. */
export const Burst: Story = {
  args: {
    initial: view(posts(17)),
    script: [
      {
        after: 1_000,
        answer: view([
          post(34),
          post(33),
          post(32),
          post(31),
          post(30),
          ...posts(17),
        ]),
      },
    ],
  },
}

/** A post removed 1 s after the screen opened: its card fades and the slot refills. */
export const Removal: Story = {
  args: {
    initial: view(posts(24)),
    script: [
      {
        after: 1_000,
        answer: view(posts(24).filter((p) => p._id !== 'wallPost-20')),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector('[data-post="wallPost-20"]'),
        ).toBeNull(),
      { timeout: 5_000 },
    )
  },
}

/** Three failed polls: the offline dot in the corner; the board keeps cycling. */
export const Offline: Story = {
  args: {
    initial: view(posts(24)),
    script: [
      { after: 300, fail: true },
      { after: 300, fail: true },
      { after: 300, fail: true },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(
      () =>
        expect(canvas.getByRole('status', { name: 'Offline' })).toBeVisible(),
      { timeout: 5_000 },
    )
  },
}

/** Fewer than 17: the posts there are, spread over the first slots. */
export const Few: Story = { args: { initial: view(posts(5)) } }

/** No post yet: a large QR card and the invitation. */
export const Empty: Story = {
  args: { initial: view([]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Be the first on the wall')).toBeVisible()
    await expect(
      await canvas.findByRole('img', { name: /QR code for/ }),
    ).toBeVisible()
  },
}

/**
 * Posts whose photos all failed to load (a Wi-Fi blip during the first
 * load): the large QR rather than a blank board, without claiming the wall
 * is empty, until a later poll retries them.
 */
export const PhotosUnavailable: Story = {
  args: {
    initial: view(
      posts(6).map((p) => ({
        ...p,
        ...storyPhoto({ ...p.whole, src: '/storybook-fixtures/missing.jpg' }),
      })),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByTestId('screen-invitation')).toBeVisible()
    await expect(
      await canvas.findByRole('img', { name: /QR code for/ }),
    ).toBeVisible()
    await expect(canvas.queryByText('Be the first on the wall')).toBeNull()
    await expect(cardsOf(canvas)).toHaveLength(0)
  },
}

/** After the retention cron closed the wall (§11.1). */
export const Closed: Story = {
  args: { initial: view([], { closed: true }) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('This wall has closed.'),
    ).toBeVisible()
  },
}

/**
 * The sponsor strip (§9.4) with the REAL logos of Cloud Native Days Norway
 * 2026's public sponsors (`.storybook/fixtures/photo-wall-sponsors.json`,
 * read from production Sanity on 2026-10-24): one has no bright logo and one
 * has none at all, which is what the dark strip has to cope with.
 */
export const SponsorStrip: Story = {
  args: { initial: view(posts(24), { sponsorStrip: true }) },
  loaders: [
    async () => ({
      sponsors: (await (
        await fetch('/storybook-fixtures/photo-wall-sponsors.json')
      ).json()) as ConferenceSponsor[],
    }),
  ],
  render: (args, { loaded }) => (
    <Scripted {...args} sponsors={loaded.sponsors as ConferenceSponsor[]} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('marquee')).toBeVisible()
    await waitFor(() => expect(cardsOf(canvas)).toHaveLength(17), {
      timeout: 5_000,
    })
  },
}

/** The switch on, but no sponsor with a public tier: no strip (§9.4). */
export const SponsorStripNoPublicTier: Story = {
  args: { initial: view(posts(24), { sponsorStrip: true }) },
  render: (args) => (
    <Scripted
      {...args}
      sponsors={[
        {
          _sfcId: 'sfc-x',
          sponsor: {
            _id: 'sponsor-x',
            name: 'Tierless',
            website: 'https://example.com',
            logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
          },
          tier: null,
        } as unknown as ConferenceSponsor,
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('marquee')).toBeNull()
  },
}

const tilesOf = (canvas: ReturnType<typeof within>) =>
  canvas.queryAllByTestId('mosaic-tile')

/** Mosaic (P3): whole photos edge to edge, the newest in the spotlight tile with its caption. */
export const Mosaic: Story = {
  args: { initial: view(posts(40), { look: 'mosaic' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector(
            '[data-testid="mosaic-tile"][data-spotlight][data-post="wallPost-40"]',
          ),
        ).not.toBeNull(),
      { timeout: 5_000 },
    )
    await expect(
      await canvas.findByRole('img', { name: /QR code for/ }),
    ).toBeVisible()
    await expect(cardsOf(canvas)).toHaveLength(0)
  },
}

/** A post approved 1 s after the screen opened: it takes the spotlight at once, "Just posted". */
export const MosaicArrival: Story = {
  args: {
    initial: view(posts(40), { look: 'mosaic' }),
    script: [
      {
        after: 1_000,
        answer: view([post(41), ...posts(40)], { look: 'mosaic' }),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector(
            '[data-spotlight][data-new][data-post="wallPost-41"]',
          ),
        ).not.toBeNull(),
      { timeout: 5_000 },
    )
    await expect(within(canvasElement).getByText('Just posted')).toBeVisible()
  },
}

/** Mosaic with the sponsor strip: the mosaic fits above it. */
export const MosaicSponsorStrip: Story = {
  args: { initial: view(posts(40), { look: 'mosaic', sponsorStrip: true }) },
  loaders: SponsorStrip.loaders,
  render: SponsorStrip.render,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('marquee')).toBeVisible()
    await waitFor(() => expect(tilesOf(canvas).length).toBeGreaterThan(0), {
      timeout: 5_000,
    })
  },
}

/** Spotlight (P4): one big post at a time over a blurred copy, with "Up next". */
export const Spotlight: Story = {
  args: { initial: view(posts(24), { look: 'spotlight' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(
      () =>
        expect(canvas.getByTestId('spotlight-hero')).toHaveAttribute(
          'data-post',
          'wallPost-24',
        ),
      { timeout: 5_000 },
    )
    await expect(canvas.getAllByTestId('up-next')).toHaveLength(4)
    await expect(cardsOf(canvas)).toHaveLength(0)
  },
}

/** A post approved 1 s after the screen opened: first on "Up next", marked new, big at the end of the current turn. */
export const SpotlightArrival: Story = {
  args: {
    initial: view(posts(24), { look: 'spotlight' }),
    script: [
      {
        after: 1_000,
        answer: view([post(30), ...posts(24)], { look: 'spotlight' }),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector(
            '[data-testid="up-next"][data-new][data-post="wallPost-30"]',
          ),
        ).not.toBeNull(),
      { timeout: 5_000 },
    )
  },
}

/** Spotlight with the sponsor strip under it. */
export const SpotlightSponsorStrip: Story = {
  args: {
    initial: view(posts(24), { look: 'spotlight', sponsorStrip: true }),
  },
  loaders: SponsorStrip.loaders,
  render: SponsorStrip.render,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('marquee')).toBeVisible()
    // Past the big post's fade-in.
    await waitFor(
      () => expect(canvas.getByTestId('spotlight-hero')).toBeVisible(),
      { timeout: 5_000 },
    )
  },
}

/** The wall is on Pinboard; an organizer picks Mosaic and the screen switches on its next poll. */
export const LookSwitch: Story = {
  args: {
    initial: view(posts(24)),
    script: [{ after: 1_500, answer: view(posts(24), { look: 'mosaic' }) }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(tilesOf(canvas).length).toBeGreaterThan(0), {
      timeout: 5_000,
    })
    await expect(cardsOf(canvas)).toHaveLength(0)
  },
}

/** The wall is on Mosaic, but this screen's link says `?look=spotlight`. */
export const LookOverride: Story = {
  args: { initial: view(posts(24), { look: 'mosaic' }), look: 'spotlight' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Past the big post's fade-in.
    await waitFor(
      () => expect(canvas.getByTestId('spotlight-hero')).toBeVisible(),
      { timeout: 5_000 },
    )
    await expect(tilesOf(canvas)).toHaveLength(0)
  },
}

/** A tenant with an 8:1 wordmark: the logo shrinks to fit the 480 px rail, "Photo Wall" stays whole. */
export const SpotlightWideLogo: Story = {
  args: {
    initial: view(posts(24), { look: 'spotlight' }),
    logo: {
      title: 'Wide',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 100"><rect width="800" height="100" fill="#f59e0b"/><text x="400" y="70" font-size="70" text-anchor="middle" fill="#000">WIDE TENANT LOGO</text></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    const words = within(canvasElement).getByText('Photo Wall')
    const rail = words.closest('aside')!
    await expect(words.getBoundingClientRect().right).toBeLessThanOrEqual(
      rail.getBoundingClientRect().right + 0.5,
    )
  },
}

/** Spotlight on an empty wall: the same invitation as every look. */
export const SpotlightEmpty: Story = {
  args: { initial: view([], { look: 'spotlight' }) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Be the first on the wall'),
    ).toBeVisible()
  },
}

/**
 * The page failed to render (a read failed): `/wall/screen`'s error
 * boundary, which reloads by itself with a growing wait. Storybook's path
 * is not Screen Mode's, so it does not reload here.
 */
export const RenderError: Story = {
  render: () => (
    <ScreenError error={new Error('Sanity unavailable')} retry={() => {}} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('The wall will be back in a moment.'),
    ).toBeVisible()
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}
