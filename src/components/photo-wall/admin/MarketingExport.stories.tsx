import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import type { PhotoWallAdminView } from '@/lib/photo-wall'
import { MARKETING_EXPORT_ROUTE, MarketingExport } from './MarketingExport'
import { PhotoWallAdmin } from './PhotoWallAdmin'

const meta = {
  title: 'Systems/PhotoWall/MarketingExport',
  component: MarketingExport,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The consented ZIP export on `/admin/photo-wall` (Photo Wall spec §12, §13 P5): a download of every approved Wall Post whose contributor allowed marketing use, streamed by `GET /api/admin/photo-wall/export`, and the note that downloaded copies are the organizers’ and fall outside the 30-day deletion. The count is the server’s, by the ZIP’s own rule (`photoWall.settings`). Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  args: { count: 12 },
} satisfies Meta<typeof MarketingExport>

export default meta
type Story = StoryObj<typeof meta>

const PHONE = { viewport: { defaultViewport: 'mobile1' } }

export const WithPhotos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const download = canvas.getByRole('link', { name: 'Download ZIP' })
    await expect(download).toHaveAttribute('href', MARKETING_EXPORT_ROUTE)
    await expect(download).toHaveAttribute('download')
    await expect(download).toHaveAccessibleDescription(
      /30-day deletion doesn’t remove them/,
    )
    await expect(canvas.getByText('12 photos')).toBeVisible()
    await expect(
      canvas.getByText('If the download stops partway, start it again.'),
    ).toBeVisible()
  },
}
export const WithPhotosDark: Story = { globals: { theme: 'dark' } }
export const WithPhotosPhone: Story = { parameters: PHONE }
export const WithPhotosPhoneDark: Story = {
  parameters: PHONE,
  globals: { theme: 'dark' },
}

export const OnePhoto: Story = {
  args: { count: 1 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('1 photo')).toBeVisible()
  },
}

/** Nothing to export: no link to a download that would fail. */
export const NoConsent: Story = {
  args: { count: 0 },
  parameters: PHONE,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link')).toBeNull()
    await expect(
      canvas.getByText('No photos with marketing consent yet.'),
    ).toBeVisible()
  },
}
export const NoConsentDark: Story = {
  ...NoConsent,
  globals: { theme: 'dark' },
}

/** Before the queue answers the link is there; the route decides. */
export const CountNotLoaded: Story = {
  args: { count: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('link', { name: 'Download ZIP' }),
    ).toBeVisible()
    await expect(canvas.queryByText(/^\d+ photos?$/)).toBeNull()
  },
}

const VIEW: PhotoWallAdminView = {
  wall: {
    _id: 'photoWall-conf-A',
    postingMode: 'auto',
    sponsorStrip: false,
    look: 'pinboard',
    closedAt: null,
  },
  posting: 'ended',
  links: {
    post: 'https://2026.cloudnativedays.no/wall/post',
    wall: 'https://2026.cloudnativedays.no/wall',
    screen: 'https://2026.cloudnativedays.no/wall/screen',
  },
}

/** The whole Setup page after the event: the export under the links. */
export const InThePage: StoryObj<typeof PhotoWallAdmin> = {
  render: (args) => <PhotoWallAdmin {...args} />,
  args: {
    view: VIEW,
    conferenceTitle: 'Cloud Native Days Norway 2026',
    onSetUp: fn(),
    onChange: fn(),
    setup: true,
    marketingExport: <MarketingExport count={2} />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('region', { name: 'Marketing photos' }),
    ).toBeVisible()
  },
}
export const InThePageDark: StoryObj<typeof PhotoWallAdmin> = {
  ...InThePage,
  globals: { theme: 'dark' },
}
/** Before Set up there is nothing to export. */
export const InThePageNotSetUp: StoryObj<typeof PhotoWallAdmin> = {
  ...InThePage,
  args: { ...InThePage.args!, view: { ...VIEW, wall: null } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('region', { name: 'Marketing photos' }),
    ).toBeNull()
  },
}
