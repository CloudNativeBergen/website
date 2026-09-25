import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { mockDateBeforeEach, withPortalTheme } from '@/lib/storybook'
import type {
  MarketingAssetDetails,
  MarketingAssetFilter,
  MarketingAssetRow,
} from '@/lib/marketing-asset'
import { AssetsPage } from './AssetsPage'
import type { AssetUploader } from './upload'

const json = (data: unknown) => HttpResponse.json({ result: { data } })

/** A flat test card drawn in the browser, so the CDN is never needed. */
function card(label: string, fill: string, width: number, height: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${fill}"/><text x="50%" y="50%" fill="white" font-family="sans-serif" font-size="${Math.round(Math.min(width, height) / 9)}" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}#`
}

const EDITION = { _id: 'conf-2026', title: 'CND 2026' }
const ADA = { _id: 'sp-ada', _type: 'speaker' as const, name: 'Ada Lovelace' }
const ACME = { _id: 'sponsor-acme', _type: 'sponsor' as const, name: 'Acme' }

const row = (
  fields: Partial<MarketingAssetRow> &
    Pick<MarketingAssetRow, '_id' | 'title' | 'alt' | 'imageUrl'>,
): MarketingAssetRow => ({
  kind: 'image',
  scope: 'organization',
  conferenceId: null,
  edition: null,
  subject: null,
  tags: [],
  credit: null,
  assetId: `image-${fields._id}`,
  width: 2000,
  height: 2000,
  createdAt: '2026-09-20T10:00:00Z',
  softOnSocial: false,
  ...fields,
})

const ASSETS: MarketingAssetRow[] = [
  row({
    _id: 'asset-logo',
    title: 'Logo, dark background',
    alt: 'The Cloud Native Days Norway logo in white on navy',
    imageUrl: card('LOGO', '#1e3a8a', 2000, 2000),
    tags: ['brand', 'logo'],
  }),
  row({
    _id: 'asset-ada',
    title: 'Speaker card: Ada Lovelace',
    alt: 'Ada Lovelace, speaking on distributed tracing',
    imageUrl: card('ADA', '#be185d', 2000, 2000),
    scope: 'edition',
    conferenceId: EDITION._id,
    edition: EDITION.title,
    subject: ADA,
    tags: ['speaker card'],
    credit: 'Jane Designer, Studio Nord',
    createdAt: '2026-09-19T10:00:00Z',
  }),
  row({
    _id: 'asset-venue',
    title: 'Venue from the harbour',
    alt: 'The conference venue seen from the harbour at dusk, lights on',
    imageUrl: card('VENUE', '#0f766e', 2400, 1260),
    width: 2400,
    height: 1260,
    createdAt: '2026-09-18T10:00:00Z',
  }),
  row({
    _id: 'asset-acme',
    title: 'Sponsor thank-you: Acme',
    alt: 'Thank you Acme, our platinum sponsor',
    imageUrl: card('ACME', '#b45309', 2000, 2000),
    scope: 'edition',
    conferenceId: EDITION._id,
    edition: EDITION.title,
    subject: ACME,
    tags: ['sponsors'],
    createdAt: '2026-09-15T10:00:00Z',
  }),
  row({
    _id: 'asset-old-banner',
    title:
      'Old banner, low resolution, from the very first edition of the event',
    alt: 'A blue banner reading Cloud Native Days',
    imageUrl: card('BANNER', '#7c3aed', 960, 540),
    width: 960,
    height: 540,
    createdAt: '2026-09-10T10:00:00Z',
    softOnSocial: true,
  }),
]

/** Last year's speaker card: only under "All editions". */
const OLDER: MarketingAssetRow[] = [
  row({
    _id: 'asset-ada-2025',
    title: 'Speaker card: Ada Lovelace (2025)',
    alt: 'Ada Lovelace at last year’s edition',
    imageUrl: card('ADA 25', '#475569', 2000, 2000),
    scope: 'edition',
    conferenceId: 'conf-2025',
    edition: 'CND 2025',
    subject: ADA,
    tags: ['speaker card'],
    createdAt: '2025-09-19T10:00:00Z',
  }),
]

/** The server's filters, in the browser, over this story's assets. */
function applyFilter(
  assets: MarketingAssetRow[],
  older: MarketingAssetRow[],
  filter: MarketingAssetFilter | undefined,
) {
  const words = (filter?.search ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  return [...assets, ...(filter?.editions === 'all' ? older : [])].filter(
    (asset) =>
      (!filter?.subjectId || asset.subject?._id === filter.subjectId) &&
      (!filter?.tag || asset.tags.includes(filter.tag)) &&
      words.every((word) =>
        [asset.title, ...asset.tags].some((text) =>
          text
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .some((token) => token.startsWith(word)),
        ),
      ),
  )
}

const FACETS = {
  edition: EDITION,
  tags: ['brand', 'logo', 'speaker card', 'sponsors'],
  subjects: [ACME, ADA],
}

/**
 * A gallery that really loses an asset when it is deleted, and really changes
 * one when it is edited. Each call has its own list, which `reset` refills, so
 * a story re-run starts full again.
 */
function gallery(initial: MarketingAssetRow[] = ASSETS, older = OLDER) {
  let assets = [...initial]
  return {
    reset: () => {
      assets = [...initial]
    },
    handlers: [
      http.get('/api/trpc/marketingAsset.list', ({ request }) => {
        const raw = new URL(request.url).searchParams.get('input')
        const filter = raw ? (JSON.parse(raw) as MarketingAssetFilter) : {}
        return json(applyFilter(assets, older, filter))
      }),
      http.get('/api/trpc/marketingAsset.filters', () => json(FACETS)),
      http.get('/api/trpc/search.unified', () =>
        json({
          speakers: [{ _id: ADA._id, name: ADA.name }],
          proposals: [
            {
              _id: 'talk-tracing',
              title: 'Tracing at scale',
              status: 'confirmed',
              format: 'presentation_40',
            },
          ],
          sponsors: [{ _id: ACME._id, name: ACME.name }],
        }),
      ),
      http.post('/api/trpc/marketingAsset.update', async ({ request }) => {
        const body = (await request.json()) as {
          id: string
          details: MarketingAssetDetails
        }
        assets = assets.map((asset) =>
          asset._id === body.id
            ? {
                ...asset,
                title: body.details.title,
                alt: body.details.alt,
                tags: body.details.tags,
                credit: body.details.credit ?? null,
              }
            : asset,
        )
        return json({ updated: true })
      }),
      http.post('/api/trpc/marketingAsset.delete', async ({ request }) => {
        // The id is somewhere in tRPC's body, whatever its envelope.
        const body = await request.text()
        assets = assets.filter((asset) => !body.includes(`"${asset._id}"`))
        return json({ deleted: true })
      }),
    ],
  }
}
const handlers = (initial?: MarketingAssetRow[]) => gallery(initial).handlers
const deletable = gallery()
const editable = gallery()

const saved: AssetUploader = async () => ({
  _id: 'asset-new',
  softOnSocial: false,
})

const meta = {
  title: 'Systems/Marketing/Assets',
  component: AssetsPage,
  beforeEach: mockDateBeforeEach(new Date('2026-09-25T12:00:00Z')),
  args: { orgId: 'org-storybook', uploader: fn(saved) },
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: handlers() },
  },
  decorators: [
    withPortalTheme,
    (Story) => (
      <NotificationProvider>
        <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
} satisfies Meta<typeof AssetsPage>
export default meta
type Story = StoryObj<typeof meta>

/** A PNG of the given size, drawn in the browser. */
async function png(name: string, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  context.fillStyle = '#2563eb'
  context.fillRect(0, 0, width, height)
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png'),
  )
  return new File([blob], name, { type: 'image/png' })
}

/** The gallery with three assets, one of them flagged as soft on social. */
export const Gallery: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('Venue from the harbour'),
    ).toBeInTheDocument()
    await expect(canvas.getAllByText('May look soft on social')).toHaveLength(1)
    // This edition's and the organization-wide assets, not last year's.
    await expect(
      canvas.getByText('Speaker card: Ada Lovelace'),
    ).toBeInTheDocument()
    await expect(canvas.queryByText(/\(2025\)/)).toBeNull()
  },
}
export const GalleryMobile: Story = {
  ...Gallery,
  parameters: {
    ...meta.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
}
export const GalleryDark: Story = {
  ...Gallery,
  globals: { theme: 'dark' },
}

export const EmptyGallery: Story = {
  parameters: {
    ...meta.parameters,
    msw: { handlers: handlers([]) },
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/Nothing here yet/),
    ).toBeInTheDocument()
  },
}

/**
 * An image with a short side under 1080 px gets the warning. Saving is refused
 * until alt text is written.
 */
export const SoftImagePicked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Venue from the harbour')
    await userEvent.upload(
      canvas.getByLabelText(/Choose an image/),
      await png('speaker-card.png', 1024, 1024),
    )
    await expect(
      await canvas.findByText(
        /May look soft on social: the short side is 1024 px/,
      ),
    ).toBeInTheDocument()
    await expect(canvas.getByLabelText('Title')).toHaveValue('speaker card')
    const add = canvas.getByRole('button', { name: 'Add to gallery' })
    await expect(add).toBeDisabled()
    await userEvent.type(
      canvas.getByLabelText('Alt text'),
      'Speaker card for Ada Lovelace',
    )
    await expect(add).toBeEnabled()
  },
}
export const SoftImagePickedMobile: Story = {
  ...SoftImagePicked,
  parameters: {
    ...meta.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
}
export const SoftImagePickedDark: Story = {
  ...SoftImagePicked,
  globals: { theme: 'dark' },
}

/** The soft image still saves: the warning never refuses. */
export const UploadSoftImage: Story = {
  play: async (context) => {
    await SoftImagePicked.play!(context)
    const canvas = within(context.canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Add to gallery' }),
    )
    await waitFor(() =>
      expect(context.args.uploader).toHaveBeenCalledWith(expect.any(File), {
        title: 'speaker card',
        alt: 'Speaker card for Ada Lovelace',
        scope: 'organization',
        subject: null,
        tags: [],
      }),
    )
    // The form is ready for the next image, and focus is back on its picker.
    await expect(await canvas.findByText('Choose an image')).toBeInTheDocument()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        canvas.getByLabelText('Choose an image'),
      ),
    )
  },
}

/** The server's refusal is shown, and nothing is cleared. */
export const UploadRefused: Story = {
  args: {
    uploader: fn<AssetUploader>(async () => {
      throw new Error('Only PNG, JPEG and WebP images can be added.')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Venue from the harbour')
    await userEvent.upload(
      canvas.getByLabelText(/Choose an image/),
      await png('poster.png', 1200, 1500),
    )
    await userEvent.type(canvas.getByLabelText('Alt text'), 'A poster')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Add to gallery' }),
    )
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Only PNG, JPEG and WebP images can be added.',
    )
    await expect(canvas.getByLabelText('Alt text')).toHaveValue('A poster')
  },
}

export const DeleteAsset: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Delete Logo, dark background',
      }),
    )
    const dialog = within(document.body)
    await expect(
      await dialog.findByText('Delete “Logo, dark background”?'),
    ).toBeInTheDocument()
  },
}
/**
 * After a confirmed delete the dialog closes and its opener is gone with the
 * card, so keyboard focus lands on the gallery heading, not on the page body.
 */
export const DeleteAssetConfirmed: Story = {
  parameters: {
    ...meta.parameters,
    // Its own gallery: the deleted card must really leave the grid.
    msw: { handlers: deletable.handlers },
  },
  beforeEach: () => deletable.reset(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Delete Logo, dark background',
      }),
    )
    const body = within(document.body)
    await userEvent.click(await body.findByRole('button', { name: 'Delete' }))
    // The card, and with it the button that opened the dialog, is gone.
    await waitFor(() =>
      expect(canvas.queryByText('Logo, dark background')).toBeNull(),
    )
    await waitFor(
      () =>
        expect(document.activeElement).toBe(
          canvas.getByRole('heading', { name: /In the gallery/ }),
        ),
      { timeout: 3000 },
    )
  },
}

/** Clearing the form keeps keyboard focus on it, on the file picker. */
export const ClearKeepsFocus: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Venue from the harbour')
    await userEvent.upload(
      canvas.getByLabelText(/Choose an image/),
      await png('poster.png', 1200, 1500),
    )
    await userEvent.click(await canvas.findByRole('button', { name: 'Clear' }))
    await expect(document.activeElement).toBe(
      canvas.getByLabelText('Choose an image'),
    )
  },
}

export const DeleteAssetDark: Story = {
  ...DeleteAsset,
  globals: { theme: 'dark' },
}

/** "All editions" brings back last year's card; the subject filter narrows. */
export const FilterAllEditions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Venue from the harbour')
    await userEvent.click(canvas.getByLabelText('All editions'))
    await expect(
      await canvas.findByText('Speaker card: Ada Lovelace (2025)'),
    ).toBeInTheDocument()
    await userEvent.selectOptions(
      canvas.getByLabelText('Subject'),
      'Ada Lovelace (Speaker)',
    )
    await waitFor(() =>
      expect(canvas.queryByText('Venue from the harbour')).toBeNull(),
    )
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2)
  },
}
export const FilterAllEditionsMobile: Story = {
  ...FilterAllEditions,
  parameters: {
    ...meta.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
}
export const FilterAllEditionsDark: Story = {
  ...FilterAllEditions,
  globals: { theme: 'dark' },
}

/** Search is over titles and tags: "sponsors" is only a tag. */
export const SearchByTag: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Venue from the harbour')
    await userEvent.type(
      canvas.getByLabelText('Search titles and tags'),
      'sponsors',
    )
    await waitFor(() => expect(canvas.getAllByRole('listitem')).toHaveLength(1))
    await expect(
      canvas.getByText('Sponsor thank-you: Acme'),
    ).toBeInTheDocument()
  },
}

/** Nothing matches: the gallery says so, and offers to clear the filters. */
export const NoMatch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Venue from the harbour')
    await userEvent.type(
      canvas.getByLabelText('Search titles and tags'),
      'zebra',
    )
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Clear the filters' }),
    )
    await expect(
      await canvas.findByText('Venue from the harbour'),
    ).toBeInTheDocument()
  },
}

/** The edit dialog, open on an edition asset with a subject and a credit. */
export const EditAsset: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Edit Speaker card: Ada Lovelace',
      }),
    )
    const dialog = within(await within(document.body).findByRole('dialog'))
    await expect(dialog.getByLabelText(/^CND 2026/)).toBeChecked()
    await expect(dialog.getByLabelText(/Subject/)).toHaveValue(
      'Ada Lovelace (Speaker)',
    )
    await expect(dialog.getByLabelText(/Credit/)).toHaveValue(
      'Jane Designer, Studio Nord',
    )
    await expect(
      dialog.getByText(/cannot be found when a speaker asks to be erased/),
    ).toBeInTheDocument()
  },
}
export const EditAssetMobile: Story = {
  ...EditAsset,
  parameters: {
    ...meta.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
}
export const EditAssetDark: Story = {
  ...EditAsset,
  globals: { theme: 'dark' },
}

/** Saving the dialog changes the card. */
export const EditAssetSaved: Story = {
  parameters: {
    ...meta.parameters,
    msw: { handlers: editable.handlers },
  },
  beforeEach: () => editable.reset(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Edit Venue from the harbour',
      }),
    )
    const dialog = within(await within(document.body).findByRole('dialog'))
    await userEvent.type(dialog.getByLabelText(/Tags/), 'venue, harbour')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await expect(await canvas.findByText('#harbour')).toBeInTheDocument()
  },
}
