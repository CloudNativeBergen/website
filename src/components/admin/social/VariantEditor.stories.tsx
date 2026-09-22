import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ThemeProvider } from 'next-themes'
import { PLATFORM_CONSTRAINTS } from '@/lib/social/provider/constraints'
import type { SocialPostAttachment } from '@/lib/social/types'
import { VariantEditor, type VariantEditorProps } from './VariantEditor'
import type { VariantEditorValue } from './variant-editor-model'

/**
 * Deterministic stand-in images: the crop preview is CSS, so a data URI
 * exercises exactly the code the CDN rendition would.
 */
function svgImage(width: number, height: number, from: string, to: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><circle cx="${width * 0.7}" cy="${height * 0.4}" r="${Math.min(width, height) * 0.18}" fill="#fff" fill-opacity="0.85"/><text x="${width / 2}" y="${height * 0.9}" font-family="sans-serif" font-size="${Math.min(width, height) * 0.08}" fill="#fff" text-anchor="middle">${width}×${height}</text></svg>`
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
    alt: 'The keynote hall with a full crowd',
  },
  {
    _key: 'att-tall',
    assetId: 'image-0000000000000000000000000000000000000002-1000x1500-png',
    width: 1000,
    height: 1500,
    hotspot: null,
    crop: null,
    alt: 'A speaker on stage, portrait',
  },
  {
    _key: 'att-square',
    assetId: 'image-0000000000000000000000000000000000000003-1200x1200-webp',
    width: 1200,
    height: 1200,
    hotspot: null,
    crop: null,
    alt: 'Ticket poster, square',
  },
  {
    _key: 'att-4',
    assetId: 'image-0000000000000000000000000000000000000004-1600x900-jpg',
    width: 1600,
    height: 900,
    hotspot: null,
    crop: null,
    alt: 'Sponsor wall',
  },
  {
    _key: 'att-5',
    assetId: 'image-0000000000000000000000000000000000000005-1600x900-jpg',
    width: 1600,
    height: 900,
    hotspot: null,
    crop: null,
    alt: 'Workshop room',
  },
]

const SRC: Record<string, string> = {
  'att-wide': svgImage(2000, 1000, '#1d4ed8', '#7c3aed'),
  'att-tall': svgImage(1000, 1500, '#0f766e', '#84cc16'),
  'att-square': svgImage(1200, 1200, '#b91c1c', '#f59e0b'),
  'att-4': svgImage(1600, 900, '#334155', '#0ea5e9'),
  'att-5': svgImage(1600, 900, '#7c2d12', '#f472b6'),
}
const imageSrc = (asset: SocialPostAttachment) => SRC[asset._key] ?? ''

const BODY_LINKEDIN =
  'Early-bird tickets for Cloud Native Bergen 2027 are live.\n\nTwo days of talks and workshops on platform engineering, observability and the boring parts of running Kubernetes in production. Grab yours before the price goes up on 1 December.'

const BODY_BLUESKY =
  'Early-bird tickets for #CloudNativeBergen 2027 are live 🎟️ Two days of platform engineering, observability and production Kubernetes. Price goes up 1 December.'

const LINK =
  'https://2027.cloudnativebergen.dev/tickets?utm_source=bluesky&utm_campaign=early-bird'

type Args = Omit<VariantEditorProps, 'value' | 'onChange'> & {
  initialValue: VariantEditorValue
}

/** Holds the form state so the story behaves like the wired dialog. */
function Harness({ initialValue, ...props }: Args) {
  const [value, setValue] = useState(initialValue)
  return <VariantEditor {...props} value={value} onChange={setValue} />
}

const meta = {
  title: 'Systems/Marketing/Admin/VariantEditor',
  component: Harness,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The single-variant editor (#1007): body with the platform’s limit applied live, attachment slot with rendition preview and per-variant crop, alt text, link and time. Which rules apply comes from the adapter’s constraints, so LinkedIn and Bluesky differ with no branches in the editor.',
      },
    },
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
            <div className="min-h-screen bg-white p-6 dark:bg-gray-950">
              <div className="mx-auto max-w-5xl">
                <Story />
              </div>
            </div>
          </div>
        </ThemeProvider>
      )
    },
  ],
  args: {
    platform: 'linkedin',
    constraints: PLATFORM_CONSTRAINTS.linkedin,
    conferenceDomains: ['2027.cloudnativebergen.dev'],
    postAttachments: IMAGES,
    postDefaultScheduledAt: '2026-10-01T08:00:00.000Z',
    imageSrc,
    onSave: fn(),
    onCancel: fn(),
    authorName: 'Cloud Native Bergen',
    sources: {
      onUpload: async () => {},
      gallery: { images: [], isLoading: false, onPick: async () => {} },
    },
    initialValue: {
      body: BODY_LINKEDIN,
      link: LINK,
      attachments: [{ source: 'att-wide', crop: null, altOverride: null }],
      timing: { mode: 'default' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

export const Interactive: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Interactive playground — switch platform/constraints and the initial value with the controls.',
      },
    },
  },
}

export const LinkedIn: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'LinkedIn rules: 3,000 characters, 1.91:1 feed crop centred on the hotspot, and the link posted as the FIRST COMMENT (spec §3.1, #1134) — the hint under the Link field and the rules summary both say so.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(/posted as the first comment on linkedin/i),
    ).toBeVisible()
    await expect(
      canvas.getByText(/the link goes in the first comment/i),
    ).toBeVisible()
    // The preview shows the link where the platform puts it: a comment under
    // the post, never the link CARD Bluesky gets.
    const preview = canvas.getByText(/linkedin preview/i).parentElement!
    await expect(within(preview).getByText(/^first comment$/i)).toBeVisible()
    await expect(
      within(preview).queryByText('2027.cloudnativebergen.dev'),
    ).toBeNull()
  },
}

export const LinkedInDark: Story = {
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
    docs: { description: { story: 'The LinkedIn editor in dark mode.' } },
  },
}

/**
 * The organizer pasted our own tagged URL into the body. LinkedIn posts the
 * link as the first comment, so the body may not carry it — refused live,
 * with the same words the router uses on save.
 */
export const LinkedInOwnLinkInBody: Story = {
  args: {
    initialValue: {
      body: `${BODY_LINKEDIN}\n\nTickets → ${LINK}`,
      link: LINK,
      attachments: [{ source: 'att-wide', crop: null, altOverride: null }],
      timing: { mode: 'default' },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'A LinkedIn body carrying a URL on one of the conference own domains is an issue at save, schedule and approve (#1134). Matched on the HOST, so an untagged link or one tagged for an earlier page is caught too.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/never in the body: remove/i)).toBeVisible()
  },
}

export const LinkedInOwnLinkInBodyDark: Story = {
  args: LinkedInOwnLinkInBody.args,
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
    docs: { description: { story: 'The same refusal in dark mode.' } },
  },
}

export const Bluesky: Story = {
  args: {
    platform: 'bluesky',
    constraints: PLATFORM_CONSTRAINTS.bluesky,
    initialValue: {
      body: BODY_BLUESKY,
      link: LINK,
      attachments: [
        { source: 'att-wide', crop: null, altOverride: null },
        {
          source: 'att-tall',
          crop: { x: 0, y: 0.1, width: 1, height: 0.35 },
          altOverride: 'Our opening keynote speaker on the main stage',
        },
      ],
      timing: { mode: 'custom', localInput: '2026-10-01T07:30' },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Bluesky rules: 300 graphemes, at most four images, alt text mandatory, and the link as a CARD — unchanged by #1134. The second image carries a per-variant crop override and an alt override.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/shown as a link card/i)).toBeVisible()
    const preview = canvas.getByText(/bluesky preview/i).parentElement!
    await expect(
      within(preview).getByText('2027.cloudnativebergen.dev'),
    ).toBeVisible()
    await expect(within(preview).queryByText(/^first comment$/i)).toBeNull()
  },
}

export const BlueskyOverLimit: Story = {
  args: {
    platform: 'bluesky',
    constraints: PLATFORM_CONSTRAINTS.bluesky,
    initialValue: {
      body: `${BODY_LINKEDIN}\n\nSee you in Bergen! Student and group discounts are available on request, and every ticket includes lunch, the speaker dinner and the workshop day.`,
      link: LINK,
      attachments: [],
      timing: { mode: 'default' },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'A LinkedIn-length body in the Bluesky variant: the counter turns red, the issue names the overage, and Save is disabled.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('length-counter')).toHaveTextContent(
      /\/ 300$/,
    )
    await expect(
      canvas.getByRole('button', { name: 'Save variant' }),
    ).toBeDisabled()
  },
}

export const TypePastTheLimit: Story = {
  args: {
    platform: 'bluesky',
    constraints: PLATFORM_CONSTRAINTS.bluesky,
    initialValue: {
      body: 'x'.repeat(295),
      link: '',
      attachments: [],
      timing: { mode: 'default' },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'The demo from the ticket: type past the limit and the error appears live, with Save disabled until the body is trimmed again.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = canvas.getByLabelText('Body')
    const save = canvas.getByRole('button', { name: 'Save variant' })
    await expect(save).toBeEnabled()
    await userEvent.type(body, ' and six more')
    await expect(
      canvas.getByText(/308 characters, the limit is 300/),
    ).toBeVisible()
    await expect(save).toBeDisabled()
    await userEvent.type(body, '{Backspace>8/}')
    await expect(save).toBeEnabled()
  },
}

export const AdjustingTheCrop: Story = {
  args: {
    initialValue: {
      body: BODY_LINKEDIN,
      link: LINK,
      attachments: [
        { source: 'att-wide', crop: null, altOverride: null },
        {
          source: 'att-tall',
          crop: { x: 0, y: 0.1, width: 1, height: 0.35 },
          altOverride: 'Our opening keynote speaker on the main stage',
        },
      ],
      timing: { mode: 'default' },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'The per-variant crop override on a platform that crops (LinkedIn, 1.91:1): drag the window over the source, zoom with the slider, or return to the platform default. Bluesky shows images uncropped, so it has no crop editor.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getAllByRole('button', { name: 'Adjust crop' })[1],
    )
    await expect(
      canvas.getByRole('slider', { name: /Crop position/ }),
    ).toBeVisible()
  },
}

export const MissingAltText: Story = {
  args: {
    platform: 'bluesky',
    constraints: PLATFORM_CONSTRAINTS.bluesky,
    initialValue: {
      body: BODY_BLUESKY,
      link: '',
      attachments: [{ source: 'att-square', crop: null, altOverride: '' }],
      timing: { mode: 'default' },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'An alt override blanked out: Bluesky requires alt text, so the media issue blocks saving.',
      },
    },
  },
}

export const TooManyImages: Story = {
  args: {
    platform: 'bluesky',
    constraints: PLATFORM_CONSTRAINTS.bluesky,
    initialValue: {
      body: BODY_BLUESKY,
      link: '',
      attachments: IMAGES.map((i) => ({
        source: i._key,
        crop: null,
        altOverride: null,
      })),
      timing: { mode: 'default' },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Five images on a four-image platform: the counter and the media issue both say so.',
      },
    },
  },
}

export const BadLink: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'A link without a scheme is refused before it reaches the platform.',
      },
    },
  },
  args: {
    initialValue: {
      body: BODY_LINKEDIN,
      link: 'cloudnativebergen.dev/tickets',
      attachments: [],
      timing: { mode: 'default' },
    },
  },
}

export const NoPlatformRulesYet: Story = {
  args: {
    platform: 'mastodon',
    constraints: null,
    initialValue: {
      body: BODY_BLUESKY,
      link: LINK,
      attachments: [{ source: 'att-wide', crop: null, altOverride: null }],
      timing: { mode: 'default' },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'A platform without an adapter: no counter, no crop, the editor says nothing is checked — including about the LINK. With no constraints there is no `linkPlacement` to look up, so the field must not claim a link card while the rules summary right above says nothing is known.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/no platform rules are known/i)).toBeVisible()
    // A VALUE, and the two must agree: the hint names no placement at all.
    await expect(
      canvas.getByText('Add it where Mastodon takes a link.'),
    ).toBeVisible()
    await expect(canvas.queryByText(/link card/i)).toBeNull()
    await expect(canvas.queryByText(/first comment/i)).toBeNull()
  },
}

export const NoPlatformRulesYetDark: Story = {
  args: NoPlatformRulesYet.args,
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
    docs: { description: { story: 'The same, in dark mode.' } },
  },
}

export const NoImagesYet: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'A fresh variant on a post with no images and no default time: empty body issue, no library yet.',
      },
    },
  },
  args: {
    postAttachments: [],
    postDefaultScheduledAt: null,
    initialValue: {
      body: '',
      link: '',
      attachments: [],
      timing: { mode: 'default' },
    },
  },
}

export const Saving: Story = {
  args: { saving: true },
  parameters: {
    docs: {
      description: {
        story: 'Every control is disabled while the save is in flight.',
      },
    },
  },
}

export const ServerRefused: Story = {
  args: {
    error: 'The variant changed while you were editing. Reload and retry.',
  },
  parameters: {
    docs: {
      description: {
        story:
          'A server-side refusal (here the compare-and-set conflict) is shown above the actions.',
      },
    },
  },
}

export const BlueskyDark: Story = {
  args: Bluesky.args,
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
    docs: { description: { story: 'The Bluesky editor in dark mode.' } },
  },
}
