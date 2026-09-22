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
  submission: null,
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

/** LinkedIn takes the link in the body, so "Copy text" carries it. */
export const AwaitingManual: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const text = canvas
      .getByRole('button', { name: /copy text/i })
      .closest('section')
    await expect(text).toHaveTextContent('utm_content=early-bird')
    await expect(text).toHaveTextContent('The link is added at the end.')
  },
}

/** A body that already carries the link is copied as written. */
export const LinkAlreadyInBody: Story = {
  args: {
    variant: {
      ...variant,
      body: `Tickets: ${variant.link}\n\nGrab yours before 1 December.`,
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

/** A body near the cap plus the appended link overshoots: say so. */
export const OverLimitWithLink: Story = {
  args: { variant: { ...variant, body: 'x'.repeat(2950) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('alert')[0]).toHaveTextContent(
      /shorten the text/i,
    )
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

/**
 * #1128, spec §5: the manual FALLBACK. With an asynchronous publisher a
 * variant never reaches `awaiting-manual`, so a post that DID go out is
 * recorded from `failed` — the same form, the same URL check.
 */
export const FailedFallback: Story = {
  args: {
    variant: {
      ...variant,
      status: 'failed',
      attempts: [
        { _key: 'a1', at: '2026-09-13T09:00:07.000Z', outcome: 'submitted' },
        {
          _key: 'a2',
          at: '2026-09-13T09:15:07.000Z',
          outcome: 'ambiguous',
          error:
            'The publisher did not confirm the post within 15 minutes. Check the platform before posting again.',
        },
      ],
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByLabelText(/address of the published post/i)
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
