import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ThemeProvider } from 'next-themes'
import { PLATFORM_CONSTRAINTS } from '@/lib/social/provider/constraints'
import { STUDIO_FORMATS, type StudioFormat } from '@/lib/marketing-asset'
import { formatMismatchWarning } from '@/lib/marketing-asset/channel-format'
import type { SocialPostAttachment } from '@/lib/social/types'
import { VariantEditor, type VariantEditorProps } from './VariantEditor'
import type { MarketingAssetPick } from './AttachmentSlot'
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

/**
 * A Task's post (short-links spec §2.3): the locked Link field and the
 * first-comment preview show the `/go/<code>` short link that is posted, not
 * the tagged link it expands to.
 */
export const LinkedInTaskShortLink: Story = {
  args: {
    linkLocked: true,
    postedLink: 'https://2027.cloudnativebergen.dev/go/k7m2qp',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Link')).toHaveValue(
      'https://2027.cloudnativebergen.dev/go/k7m2qp',
    )
    const preview = canvas.getByText(/linkedin preview/i).parentElement!
    await expect(
      within(preview).getByText('https://2027.cloudnativebergen.dev/go/k7m2qp'),
    ).toBeVisible()
    await expect(within(preview).queryByText(/utm_/)).toBeNull()
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

/** The marketing asset gallery as the picker lists it for a talk's post. */
const ASSET_PICKS: MarketingAssetPick[] = [
  {
    id: 'asset-ada-card',
    title: 'Speaker card: Ada Lovelace',
    alt: 'Ada Lovelace, speaking on distributed tracing',
    thumbnailSrc: svgImage(1200, 1200, '#be185d', '#f472b6'),
    attachable: true,
    context: 'About Ada Lovelace',
  },
  {
    id: 'asset-ada-2025',
    title: 'Ada at the 2025 keynote',
    alt: 'Ada Lovelace on the main stage in 2025',
    thumbnailSrc: svgImage(1600, 900, '#0f766e', '#84cc16'),
    attachable: true,
    context: 'About Ada Lovelace',
  },
  {
    id: 'asset-venue',
    title: 'Venue, evening',
    alt: 'The venue lit up at dusk',
    thumbnailSrc: svgImage(2000, 1000, '#1d4ed8', '#7c3aed'),
    attachable: true,
    context: 'CND 2027',
  },
  {
    id: 'asset-countdown',
    title: 'Countdown, animated',
    alt: 'A countdown to opening day',
    thumbnailSrc: svgImage(1080, 1080, '#b91c1c', '#f59e0b'),
    attachable: false,
    context: 'CND 2027',
  },
  {
    id: 'asset-logo',
    title: 'Logo, dark background',
    alt: 'The Cloud Native Bergen logo in white on navy',
    thumbnailSrc: svgImage(1200, 1200, '#1e3a8a', '#334155'),
    attachable: true,
    context: 'Whole organization',
  },
]

/** The picker with its search and edition switch held, as the wired editor does. */
function AssetPickerHarness({
  onPickAsset,
  pickerError,
  picks = ASSET_PICKS,
  ...args
}: Args & {
  onPickAsset: (asset: MarketingAssetPick) => void
  pickerError?: string
  picks?: MarketingAssetPick[]
}) {
  const [search, setSearch] = useState('')
  const [allEditions, setAllEditions] = useState(false)
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const assets = picks.filter((asset) =>
    words.every((word) =>
      asset.title
        .toLowerCase()
        .split(/\W+/)
        .some((w) => w.startsWith(word)),
    ),
  )
  return (
    <Harness
      {...args}
      sources={{
        ...args.sources,
        marketingAssets: {
          assets,
          isLoading: false,
          error: pickerError ?? null,
          onRetry: () => {},
          search,
          onSearchChange: setSearch,
          allEditions,
          onAllEditionsChange: setAllEditions,
          onPick: async (asset) => onPickAsset(asset),
        },
      }}
    />
  )
}

const pickerArgs = {
  onPickAsset: fn(),
  initialValue: {
    body: BODY_LINKEDIN,
    link: LINK,
    attachments: [],
    timing: { mode: 'default' as const },
  },
}

const openPicker = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  await userEvent.click(
    canvas.getByRole('button', { name: 'Marketing assets' }),
  )
  return within(canvas.getByRole('group', { name: 'Marketing assets' }))
}

/**
 * "Marketing assets" beside upload and photo gallery (#1163, assets spec §5):
 * the post's subject first, then this edition, then the organization. A GIF
 * is shown but marked, and cannot be picked.
 */
export const MarketingAssetPicker: Story = {
  args: pickerArgs as unknown as Story['args'],
  render: (args) => (
    <AssetPickerHarness
      {...(args as unknown as Args & {
        onPickAsset: (asset: MarketingAssetPick) => void
      })}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The marketing asset source: search over title and tags, the post’s subject first, and a GIF marked “can’t be attached yet”. Picking sends only the asset id; the server copies the image and alt text.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const picker = await openPicker(canvasElement)
    const gif = picker.getByRole('button', {
      name: "Countdown, animated (CND 2027): can't be attached yet",
    })
    await expect(gif).toBeDisabled()
    await expect(picker.getByText("Can't be attached yet")).toBeVisible()
    // The subject's assets lead.
    const tiles = picker.getAllByRole('button', { name: /^Add |: can't/ })
    await expect(tiles[0]).toHaveAccessibleName(
      'Add Speaker card: Ada Lovelace (About Ada Lovelace) to the post',
    )
  },
}

/** Search, then pick: only the asset's id leaves the slot. */
export const PickingAMarketingAsset: Story = {
  args: pickerArgs as unknown as Story['args'],
  render: MarketingAssetPicker.render,
  parameters: {
    docs: {
      description: {
        story: 'Searching narrows the list; picking hands the asset on.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const picker = await openPicker(canvasElement)
    // Enter finishes the search; it must not submit the editor's form. Save
    // is enabled, so a submit WOULD reach onSave: the check is not vacuous.
    await expect(
      within(canvasElement).getByRole('button', { name: 'Save variant' }),
    ).toBeEnabled()
    await userEvent.type(
      picker.getByRole('searchbox', { name: 'Search marketing assets' }),
      'logo{Enter}',
    )
    await expect(args.onSave).not.toHaveBeenCalled()
    await expect(picker.getAllByRole('listitem')).toHaveLength(1)
    await userEvent.click(
      picker.getByRole('button', {
        name: 'Add Logo, dark background (Whole organization) to the post',
      }),
    )
    const onPick = (args as unknown as { onPickAsset: ReturnType<typeof fn> })
      .onPickAsset
    await expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'asset-logo' }),
    )
  },
}

export const MarketingAssetPickerDark: Story = {
  args: pickerArgs as unknown as Story['args'],
  render: MarketingAssetPicker.render,
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
    docs: {
      description: { story: 'The marketing asset picker in dark mode.' },
    },
  },
  play: async ({ canvasElement }) => {
    await openPicker(canvasElement)
  },
}

export const MarketingAssetPickerMobile: Story = {
  args: pickerArgs as unknown as Story['args'],
  render: MarketingAssetPicker.render,
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: { story: 'The marketing asset picker on a phone.' },
    },
  },
  play: async ({ canvasElement }) => {
    const picker = await openPicker(canvasElement)
    // Three across on a phone, every tile inside the viewport.
    const tile = picker.getAllByRole('listitem')[0]
    await expect(tile.getBoundingClientRect().width).toBeLessThan(
      window.innerWidth / 3,
    )
  },
}

/** The list could not be read: said so, never shown as an empty gallery. */
export const MarketingAssetPickerFailed: Story = {
  args: {
    ...pickerArgs,
    pickerError: 'Network error',
  } as unknown as Story['args'],
  render: MarketingAssetPicker.render,
  play: async ({ canvasElement }) => {
    const picker = await openPicker(canvasElement)
    await expect(picker.getByRole('alert')).toHaveTextContent(
      'Could not load the marketing assets: Network error',
    )
    await expect(picker.queryByText(/has nothing for this post/)).toBeNull()
    await expect(picker.queryAllByRole('listitem')).toHaveLength(0)
  },
}

/** A save in flight disables the open picker's tiles too. */
export const MarketingAssetPickerWhileSaving: Story = {
  args: pickerArgs as unknown as Story['args'],
  render: (args) => {
    const props = args as unknown as Args & {
      onPickAsset: (asset: MarketingAssetPick) => void
    }
    return <SavingToggle {...props} />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const picker = await openPicker(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Start saving' }))
    await expect(
      picker.getByRole('button', {
        name: 'Add Logo, dark background (Whole organization) to the post',
      }),
    ).toBeDisabled()
  },
}

/** Opens the picker first, then flips `saving` — as a Save click would. */
function SavingToggle(
  props: Args & { onPickAsset: (asset: MarketingAssetPick) => void },
) {
  const [saving, setSaving] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setSaving(true)}>
        Start saving
      </button>
      <AssetPickerHarness {...props} saving={saving} />
    </>
  )
}

/**
 * The gallery as the server ranks it for one Channel (#1249): within the
 * subject / edition / organization groups, the Channel's own Format first.
 * Each tile carries its Format; a mismatch carries the platform's warning.
 */
const THUMB_COLORS: Record<StudioFormat, [string, string]> = {
  square: ['#be185d', '#f472b6'],
  landscape: ['#0f766e', '#84cc16'],
  portrait: ['#7c2d12', '#f59e0b'],
}

function rankedPicks(
  platform: 'linkedin' | 'bluesky',
  entries: [id: string, title: string, context: string, format: StudioFormat][],
): MarketingAssetPick[] {
  return entries.map(([id, title, context, format]) => {
    const { width, height } = STUDIO_FORMATS[format]
    return {
      id,
      title,
      alt: title,
      thumbnailSrc: svgImage(width, height, ...THUMB_COLORS[format]),
      attachable: true,
      context,
      format,
      formatWarning: formatMismatchWarning(platform, format),
    }
  })
}

const RANKED_FOR_LINKEDIN = rankedPicks('linkedin', [
  [
    'ada-landscape',
    'Speaker card, landscape',
    'About Ada Lovelace',
    'landscape',
  ],
  ['ada-square', 'Speaker card: Ada Lovelace', 'About Ada Lovelace', 'square'],
  ['venue', 'Venue, evening', 'CND 2027', 'landscape'],
  ['sponsor-wall', 'Sponsor wall', 'CND 2027', 'square'],
  ['speaker-portrait', 'Ada on stage', 'CND 2027', 'portrait'],
  ['logo', 'Logo, dark background', 'Whole organization', 'square'],
])

const RANKED_FOR_BLUESKY = rankedPicks('bluesky', [
  ['ada-square', 'Speaker card: Ada Lovelace', 'About Ada Lovelace', 'square'],
  [
    'ada-landscape',
    'Speaker card, landscape',
    'About Ada Lovelace',
    'landscape',
  ],
  ['sponsor-wall', 'Sponsor wall', 'CND 2027', 'square'],
  ['venue', 'Venue, evening', 'CND 2027', 'landscape'],
  ['speaker-portrait', 'Ada on stage', 'CND 2027', 'portrait'],
  ['logo', 'Logo, dark background', 'Whole organization', 'square'],
])

const tileNames = (picker: ReturnType<typeof within>) =>
  picker
    .getAllByRole('button', { name: /^Add / })
    .map((tile: HTMLElement) => tile.getAttribute('aria-label'))

const linkedInRanked = {
  ...pickerArgs,
  picks: RANKED_FOR_LINKEDIN,
} as unknown as Story['args']

/** A LinkedIn post: landscape entries lead each group, the subject's first. */
export const MarketingAssetPickerRankedForLinkedIn: Story = {
  args: linkedInRanked,
  render: MarketingAssetPicker.render,
  parameters: {
    docs: {
      description: {
        story:
          'The order the server sends for a LinkedIn post: within the subject, edition and organization groups, landscape (LinkedIn’s 1.91:1) leads. Every tile names its Format; the Channel’s own is highlighted.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const picker = await openPicker(canvasElement)
    await expect(tileNames(picker)).toEqual([
      'Add Speaker card, landscape (About Ada Lovelace, landscape) to the post',
      'Add Speaker card: Ada Lovelace (About Ada Lovelace, square) to the post',
      'Add Venue, evening (CND 2027, landscape) to the post',
      'Add Sponsor wall (CND 2027, square) to the post',
      'Add Ada on stage (CND 2027, portrait) to the post',
      'Add Logo, dark background (Whole organization, square) to the post',
    ])
  },
}

export const MarketingAssetPickerRankedForLinkedInDark: Story = {
  ...MarketingAssetPickerRankedForLinkedIn,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/** A Bluesky post: the same gallery, square first. */
export const MarketingAssetPickerRankedForBluesky: Story = {
  args: {
    ...pickerArgs,
    picks: RANKED_FOR_BLUESKY,
    platform: 'bluesky',
    constraints: PLATFORM_CONSTRAINTS.bluesky,
    initialValue: { ...pickerArgs.initialValue, body: BODY_BLUESKY },
  } as unknown as Story['args'],
  render: MarketingAssetPicker.render,
  play: async ({ canvasElement }) => {
    const picker = await openPicker(canvasElement)
    await expect(tileNames(picker).slice(0, 4)).toEqual([
      'Add Speaker card: Ada Lovelace (About Ada Lovelace, square) to the post',
      'Add Speaker card, landscape (About Ada Lovelace, landscape) to the post',
      'Add Sponsor wall (CND 2027, square) to the post',
      'Add Venue, evening (CND 2027, landscape) to the post',
    ])
  },
}

export const MarketingAssetPickerRankedForBlueskyDark: Story = {
  ...MarketingAssetPickerRankedForBluesky,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/**
 * A square entry picked into a LinkedIn post: it is added, and the slot says
 * what LinkedIn's 1.91:1 crop does to it. A warning, never a refusal.
 */
export const PickingAMismatchedFormat: Story = {
  args: linkedInRanked,
  render: MarketingAssetPicker.render,
  play: async ({ canvasElement, args }) => {
    const picker = await openPicker(canvasElement)
    await userEvent.click(
      picker.getByRole('button', { name: /^Add Logo, dark background/ }),
    )
    const onPick = (args as unknown as { onPickAsset: ReturnType<typeof fn> })
      .onPickAsset
    await expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'logo' }),
    )
    await expect(
      await within(canvasElement).findByText(
        /LinkedIn posts go out cropped to 1\.91:1/,
      ),
    ).toBeVisible()
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      'Added Logo, dark background. LinkedIn posts go out cropped to 1.91:1, so this square image loses its top and bottom. Check the crop, or pick a landscape entry.',
    )
    await expect(within(canvasElement).queryByRole('alert')).toBeNull()
  },
}

export const PickingAMismatchedFormatDark: Story = {
  ...PickingAMismatchedFormat,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

export const PickingAMismatchedFormatMobile: Story = {
  ...PickingAMismatchedFormat,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

/** Bluesky does not crop: the warning says so rather than inventing a crop. */
export const PickingAMismatchedFormatOnBluesky: Story = {
  args: MarketingAssetPickerRankedForBluesky.args,
  render: MarketingAssetPicker.render,
  play: async ({ canvasElement }) => {
    const picker = await openPicker(canvasElement)
    await userEvent.click(
      picker.getByRole('button', { name: /^Add Venue, evening/ }),
    )
    await expect(
      await within(canvasElement).findByText(/Bluesky does not crop images/),
    ).toBeVisible()
  },
}

/**
 * The photo-gallery source with the EDITION control (#1191): pictures from a
 * previous edition of the organization, chosen from the editions the server
 * lists. Single-edition organizations never see the control.
 */
export const GalleryPickerPreviousEdition: Story = {
  args: {
    initialValue: {
      body: BODY_LINKEDIN,
      link: LINK,
      attachments: [],
      timing: { mode: 'default' as const },
    },
    sources: {
      onUpload: async () => {},
      gallery: {
        isLoading: false,
        onPick: async () => {},
        images: IMAGES.slice(0, 3).map((image) => ({
          id: `gal-${image._key}`,
          alt: image.alt,
          thumbnailSrc: SRC[image._key],
        })),
        editions: {
          options: {
            current: { _id: 'conf-2027', title: 'Cloud Native Bergen 2027' },
            previous: [
              {
                _id: 'conf-2026',
                title: 'Cloud Native Bergen 2026',
                startDate: '2026-10-28',
                endDate: '2026-10-29',
              },
              {
                _id: 'conf-2025',
                title: 'Cloud Native Days Bergen 2025',
                startDate: '2025-10-28',
                endDate: '2025-10-29',
              },
            ],
          },
          value: 'conf-2026',
          onChange: fn(),
        },
      },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'The gallery picker open on a previous edition: the edition select above the tiles, the current edition as its default option.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'From gallery' }))
    const select = canvas.getByRole('combobox', {
      name: 'Edition',
    }) as HTMLSelectElement
    await expect(select.value).toBe('conf-2026')
    await expect(canvas.getAllByRole('listitem').length).toBeGreaterThan(0)
    await userEvent.selectOptions(select, 'conf-2025')
    const onChange = args.sources?.gallery?.editions?.onChange
    await expect(onChange).toHaveBeenLastCalledWith('conf-2025')
  },
}

export const GalleryPickerPreviousEditionDark: Story = {
  args: GalleryPickerPreviousEdition.args,
  play: GalleryPickerPreviousEdition.play,
  parameters: { theme: 'dark' },
}

/** The gallery could not be read: said so, never shown as an empty gallery. */
export const GalleryPickerFailed: Story = {
  args: {
    ...GalleryPickerPreviousEdition.args,
    sources: {
      onUpload: async () => {},
      gallery: {
        images: [],
        isLoading: false,
        error: 'That edition is not one this organization can browse.',
        onPick: async () => {},
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'From gallery' }))
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'That edition is not one this organization can browse.',
    )
    await expect(canvas.queryByText('The gallery is empty.')).toBeNull()
  },
}
