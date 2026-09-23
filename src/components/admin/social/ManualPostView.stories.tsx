import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ThemeProvider } from 'next-themes'
import type {
  SocialPostAttachment,
  SocialPostVariant,
} from '@/lib/social/types'
import { ManualPostView } from './ManualPostView'

function svgImage(width: number, height: number, from: string, to: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><circle cx="${width * 0.7}" cy="${height * 0.4}" r="${Math.min(width, height) * 0.18}" fill="#fff" fill-opacity="0.85"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const IMAGES: SocialPostAttachment[] = [
  {
    _key: 'att-wide',
    assetId: 'image-0000000000000000000000000000000000000001-2000x1000-jpg',
    width: 2000,
    height: 1000,
    hotspot: { x: 0.7, y: 0.4 },
    crop: null,
    alt: 'The keynote hall at Cloud Native Bergen, seen from the back row',
  },
  {
    _key: 'att-tall',
    assetId: 'image-0000000000000000000000000000000000000002-1000x1500-png',
    width: 1000,
    height: 1500,
    hotspot: null,
    crop: null,
    alt: '',
  },
]

const imageSrc = (asset: SocialPostAttachment) =>
  asset._key === 'att-wide'
    ? svgImage(2000, 1000, '#1d4ed8', '#7c3aed')
    : svgImage(1000, 1500, '#0f766e', '#f59e0b')

const variant: SocialPostVariant = {
  _id: 'v-1',
  _rev: 'rev-1',
  postId: 'post-1',
  conferenceId: 'conf-1',
  orgId: 'org-1',
  platform: 'linkedin',
  body: 'Early-bird tickets for Cloud Native Bergen 2027 are live.\n\nTwo days of platform engineering, Kubernetes and cloud-native practice by the fjord. Grab yours before the price goes up on 1 December.\n\n#CloudNativeBergen #Kubernetes',
  status: 'awaiting-manual',
  scheduledAt: '2026-09-13T09:00:00.000Z',
  usesCustomTime: false,
  claimedAt: null,
  shortCode: null,
  link: 'https://cloudnativebergen.dev/tickets?utm_source=linkedin&utm_medium=social&utm_campaign=tickets&utm_content=early-bird',
  attachments: [{ source: 'att-wide', crop: null, altOverride: null }],
  publishResult: null,
  attempts: [
    { _key: 'a1', at: '2026-09-13T09:00:07.000Z', outcome: 'awaiting-manual' },
  ],
  attemptCount: 1,
}

const meta = {
  title: 'Systems/Marketing/Admin/ManualPostView',
  component: ManualPostView,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The copy-ready view for a manual Channel (#1006): text, downloadable rendition with alt text, and the tagged link, each with a copy button, then "mark as posted" with the required post URL validated against the platform domain.',
      },
    },
  },
  args: {
    variant,
    postAttachments: IMAGES,
    imageSrc,
    onMarkPosted: fn(),
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <div className={dark ? 'dark' : ''}>
            <div className="min-h-screen bg-white p-4 dark:bg-gray-950">
              <div className="mx-auto max-w-3xl">
                <Story />
              </div>
            </div>
          </div>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof ManualPostView>

export default meta
type Story = StoryObj<typeof meta>

/**
 * LinkedIn posts the link as the FIRST COMMENT (spec §3.1, #1134): the copied
 * text does NOT carry it, the Link section is a copy-ready step of its own,
 * and the numbered steps say when to post it.
 */
export const AwaitingManual: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const text = canvas
      .getByRole('button', { name: /copy text/i })
      .closest('section')
    await expect(text).not.toHaveTextContent('utm_content=early-bird')
    await expect(text).not.toHaveTextContent('The link is added at the end.')

    const linkSection = canvas
      .getByRole('button', { name: /copy link/i })
      .closest('section')
    await expect(linkSection).toHaveTextContent('utm_content=early-bird')
    await expect(linkSection).toHaveTextContent(/first comment/i)
    await expect(
      canvas.getByText(/add the link as the first comment/i),
    ).toBeVisible()
  },
}

/**
 * Bluesky is `linkPlacement: 'card'` and is UNCHANGED by #1134: posting by
 * hand, the URL in the text is what makes the card, so it is still appended
 * to the copied text unless the body already carries it.
 */
export const BlueskyLinkAppended: Story = {
  args: {
    variant: {
      ...variant,
      platform: 'bluesky',
      body: 'Early-bird tickets for #CloudNativeBergen 2027 are live 🎟️',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const text = canvas
      .getByRole('button', { name: /copy text/i })
      .closest('section')
    await expect(text).toHaveTextContent('utm_content=early-bird')
    await expect(text).toHaveTextContent('The link is added at the end.')
  },
}

/** A Bluesky body that already carries the link is copied as written. */
export const LinkAlreadyInBody: Story = {
  args: {
    variant: {
      ...variant,
      platform: 'bluesky',
      body: `Tickets: ${variant.link}`,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const text = canvas
      .getByRole('button', { name: /copy text/i })
      .closest('section')
    await expect(text).toHaveTextContent('utm_content=early-bird')
    await expect(text).not.toHaveTextContent('The link is added at the end.')
  },
}

/** A Bluesky body near the 300-grapheme cap plus the appended link overshoots. */
export const OverLimitWithLink: Story = {
  args: {
    variant: { ...variant, platform: 'bluesky', body: 'x'.repeat(290) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('alert')[0]).toHaveTextContent(
      /shorten the text/i,
    )
  },
}

/**
 * A platform no adapter describes yet: unchanged from before #1134 — the link
 * is neither appended to the text nor called a first comment, it is its own
 * "Copy the link" step.
 */
export const NoPlatformRules: Story = {
  args: { variant: { ...variant, platform: 'mastodon' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const text = canvas
      .getByRole('button', { name: /copy text/i })
      .closest('section')
    await expect(text).not.toHaveTextContent('utm_content=early-bird')
    const linkSection = canvas
      .getByRole('button', { name: /copy link/i })
      .closest('section')
    await expect(linkSection).toHaveTextContent(
      'Add it where Mastodon takes a link.',
    )
    await expect(canvas.getByText(/^copy the link$/i)).toBeVisible()
  },
}

/**
 * A LinkedIn variant materialized from the 2026.1 built-in, handed over before
 * the first-comment rule existed (#1134). It cannot be refused here — it is
 * already `awaiting-manual`, which is no longer editable — and there is no
 * migration, so the view says what to do instead of presenting the text as
 * ready to copy.
 */
export const LegacyLinkInBody: Story = {
  args: {
    variant: {
      ...variant,
      body: `Early-bird tickets for Cloud Native Bergen 2027 are live.\n\nTickets → ${variant.link}\n\n#CloudNativeBergen`,
    },
    conferenceDomains: ['cloudnativebergen.dev'],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const warning = canvas
      .getAllByRole('alert')
      .find((el) => /first comment/i.test(el.textContent ?? ''))
    await expect(warning).toBeDefined()
    await expect(warning).toHaveTextContent('utm_content=early-bird')
    await expect(warning).toHaveTextContent(/delete it from the text/i)
  },
}

export const LegacyLinkInBodyDark: Story = {
  args: LegacyLinkInBody.args,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/** The same body WITHOUT the conference domains: nothing to compare, no warning. */
export const LegacyLinkInBodyNoDomains: Story = {
  args: { variant: LegacyLinkInBody.args!.variant },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas
        .queryAllByRole('alert')
        .filter((el) => /first comment/i.test(el.textContent ?? '')),
    ).toHaveLength(0)
  },
}

export const AwaitingManualDark: Story = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

export const TwoImagesNoLink: Story = {
  args: {
    variant: {
      ...variant,
      link: null,
      attachments: [
        { source: 'att-wide', crop: null, altOverride: null },
        { source: 'att-tall', crop: null, altOverride: null },
      ],
    },
  },
}

/** The post lost an image the variant was approved with. */
export const MissingImage: Story = {
  args: {
    variant: {
      ...variant,
      attachments: [
        { source: 'att-wide', crop: null, altOverride: null },
        { source: 'att-deleted', crop: null, altOverride: null },
      ],
    },
  },
}

export const TextOnly: Story = {
  args: { variant: { ...variant, link: null, attachments: [] } },
}

export const AlreadyPosted: Story = {
  args: {
    variant: {
      ...variant,
      status: 'published',
      publishResult: {
        url: 'https://www.linkedin.com/posts/cloudnativebergen_activity-7238',
      },
    },
  },
}

export const ServerRefusal: Story = {
  args: {
    error: 'The variant changed while you were editing. Reload and retry.',
  },
}

/** The URL check runs in the view before the server is asked. */
export const RefusesForeignUrl: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByLabelText(/address of the published post/i)
    await userEvent.type(field, 'https://bsky.app/profile/cndn/post/3k')
    await userEvent.click(
      canvas.getByRole('button', { name: /mark as posted/i }),
    )
    await expect(canvas.getByRole('alert')).toHaveTextContent(/linkedin\.com/)
    await expect(args.onMarkPosted).not.toHaveBeenCalled()

    await userEvent.clear(field)
    await userEvent.type(
      field,
      'https://www.linkedin.com/posts/cloudnativebergen_activity-7238',
    )
    await userEvent.click(
      canvas.getByRole('button', { name: /mark as posted/i }),
    )
    await expect(args.onMarkPosted).toHaveBeenCalledWith(
      'https://www.linkedin.com/posts/cloudnativebergen_activity-7238',
    )
  },
}
