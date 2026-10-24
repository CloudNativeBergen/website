import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useEffect, useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import type { ScreenPost, ScreenView } from '@/lib/photo-wall/screen'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { ScreenBoard, type ScreenPoll } from './ScreenBoard'

/**
 * Local fixture photos (`.storybook/main.ts` staticDirs): no network. On the
 * site `src` is already Sanity's `rect=` square; here it is the whole photo,
 * which the polaroid's `object-cover` shows centred.
 */
const PHOTOS = [
  '/storybook-fixtures/wall-landscape.jpg',
  '/storybook-fixtures/wall-portrait.jpg',
  '/storybook-fixtures/wall-photo.jpg',
  '/storybook-fixtures/wall-panorama.jpg',
  '/storybook-fixtures/wall-tall.jpg',
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
  src: PHOTOS[n % PHOTOS.length],
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
}: {
  initial: ScreenView
  script?: Step[]
  sponsors?: ConferenceSponsor[]
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
        logo: { title: 'Cloud Native Days Norway' },
        postUrl: 'https://2026.cloudnativedays.no/wall/post',
        sponsors,
      }}
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
          'Screen Mode `/wall/screen` (Photo Wall spec §9.2–§9.4), slice M5b: the Pinboard on a 1920×1080 canvas scaled to the display, always dark by its own `dark` class (the global `theme` toolbar changes nothing), the conference logo and brand accent, up to 17 tilted polaroids, the QR polaroid pointing at the Composer, the "new" mark on an arrival, the offline dot, the sponsor strip, the empty and closed states. The stories play a script of polls into the board; on the site `photoWallPublic.screen` is polled every 5 s. Capture at 1920×1080 (`pnpm shoot <id> 1920 1080`).',
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
    await expect(canvas.getByRole('img', { name: /QR code for/ })).toBeVisible()
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
    await expect(
      within(canvasElement).getByText('Be the first on the wall'),
    ).toBeVisible()
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
