import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type {
  PhotoWall,
  PhotoWallAdminView,
  PostingState,
} from '@/lib/photo-wall'
import { PhotoWallAdmin } from './PhotoWallAdmin'
import { PhotoWallAdminPage } from './PhotoWallAdminPage'

const LINKS = {
  post: 'https://2026.cloudnativedays.no/wall/post',
  wall: 'https://2026.cloudnativedays.no/wall',
  screen: 'https://2026.cloudnativedays.no/wall/screen',
}
const WALL: PhotoWall = {
  _id: 'photoWall-conf-A',
  postingMode: 'paused',
  sponsorStrip: false,
  closedAt: null,
}
const view = (
  wall: Partial<PhotoWall> | null,
  posting: PostingState = 'paused',
): PhotoWallAdminView => ({
  wall: wall && { ...WALL, ...wall },
  posting,
  links: LINKS,
})

const meta = {
  title: 'Systems/PhotoWall/PhotoWallAdmin',
  component: PhotoWallAdmin,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The organizers’ Photo Wall page, `/admin/photo-wall` (Photo Wall spec §10), slice M1: before setup a short explanation and **Set up the Photo Wall**; after it the **Posting** (Open / Paused) and **Sponsor strip** switches, and the links: the posting link with its QR and PNG download, the Wall page and Screen Mode, each with Copy. One column on a phone, side by side on a wide screen. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  args: {
    view: view(WALL),
    conferenceTitle: 'Cloud Native Days Norway 2026',
    onSetUp: fn(),
    onChange: fn(),
  },
} satisfies Meta<typeof PhotoWallAdmin>

export default meta
type Story = StoryObj<typeof meta>

const PHONE = { viewport: { defaultViewport: 'mobile1' } }

export const NotSetUp: Story = {
  args: { view: view(null) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Set up the Photo Wall' }),
    )
    await expect(args.onSetUp).toHaveBeenCalledOnce()
    await expect(canvas.queryByRole('switch')).toBeNull()
  },
}
export const NotSetUpDark: Story = {
  args: { view: view(null) },
  globals: { theme: 'dark' },
}
export const NotSetUpPhone: Story = {
  args: { view: view(null) },
  parameters: PHONE,
}

export const Paused: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const posting = canvas.getByRole('radiogroup', { name: 'Posting' })
    await expect(
      within(posting).getByRole('radio', { name: 'Paused' }),
    ).toBeChecked()
    // The mode already on does nothing.
    await userEvent.click(
      within(posting).getByRole('radio', { name: 'Paused' }),
    )
    await expect(args.onChange).not.toHaveBeenCalled()
    await userEvent.click(within(posting).getByRole('radio', { name: 'Open' }))
    await expect(args.onChange).toHaveBeenCalledWith({ postingMode: 'open' })
    const strip = canvas.getByRole('switch', { name: 'Sponsor strip' })
    await expect(strip).not.toBeChecked()
    await userEvent.click(strip)
    await expect(args.onChange).toHaveBeenLastCalledWith({ sponsorStrip: true })
  },
}
/** The radios are native: one tab stop, arrow keys choose. */
export const PausedKeyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.tab()
    await expect(canvas.getByRole('radio', { name: 'Paused' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect(args.onChange).toHaveBeenCalledWith({ postingMode: 'open' })
  },
}

/** A save on its way: says so, keeps focus, and ignores another press. */
export const Saving: Story = {
  args: { saving: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent('Saving…')
    const strip = canvas.getByRole('switch', { name: 'Sponsor strip' })
    await userEvent.click(strip)
    await expect(strip).toHaveFocus()
    await userEvent.click(canvas.getByRole('radio', { name: 'Open' }))
    await expect(args.onChange).not.toHaveBeenCalled()
    await expect(canvas.getByRole('radio', { name: 'Paused' })).toBeChecked()
  },
}

export const PausedDark: Story = { globals: { theme: 'dark' } }
export const PausedPhone: Story = { parameters: PHONE }
export const PausedPhoneDark: Story = {
  parameters: PHONE,
  globals: { theme: 'dark' },
}

export const OpenWithSponsorStrip: Story = {
  args: { view: view({ postingMode: 'open', sponsorStrip: true }, 'open') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('radio', { name: 'Open' })).toBeChecked()
    await expect(
      canvas.getByRole('switch', { name: 'Sponsor strip' }),
    ).toBeChecked()
    await expect(canvas.getByText(/Attendees can post/)).toBeVisible()
  },
}
export const OpenWithSponsorStripDark: Story = {
  args: OpenWithSponsorStrip.args,
  globals: { theme: 'dark' },
}
export const OpenPhoneDark: Story = {
  args: OpenWithSponsorStrip.args,
  parameters: PHONE,
  globals: { theme: 'dark' },
}

/** Switched Open, but the conference's last day is over (§7). */
export const ClosedAfterTheConference: Story = {
  args: { view: view({ postingMode: 'open' }, 'ended') },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/Posting has closed/),
    ).toBeVisible()
  },
}

/** Switched Open, but the conference has no end date: fail closed (§7). */
export const NoEndDate: Story = {
  args: { view: view({ postingMode: 'open' }, 'noEndDate') },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/the conference has no end date/),
    ).toBeVisible()
  },
}

export const SaveFailed: Story = {
  args: { failed: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      'Couldn’t save. Try again.',
    )
  },
}

const TRPC = '/api/trpc/photoWall'
const trpc = (data: unknown) => HttpResponse.json({ result: { data } })
let served: PhotoWallAdminView = view(null)
const updates: unknown[] = []

/** The page as `/admin/photo-wall` renders it, its procedures mocked. */
export const Page: StoryObj<typeof PhotoWallAdminPage> = {
  render: () => (
    <PhotoWallAdminPage conferenceTitle="Cloud Native Days Norway 2026" />
  ),
  beforeEach: () => {
    served = view(null)
    updates.length = 0
  },
  parameters: {
    msw: {
      handlers: [
        http.get(`${TRPC}.settings`, () => trpc(served)),
        http.post(`${TRPC}.setUp`, () => {
          served = view(WALL)
          return trpc(served)
        }),
        http.post(`${TRPC}.updateSettings`, async ({ request }) => {
          const change = (await request.json()) as Partial<PhotoWall>
          updates.push(change)
          const wall = { ...served.wall!, ...change }
          served = view(wall, wall.postingMode === 'open' ? 'open' : 'paused')
          return trpc(served)
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Set up the Photo Wall' }),
    )
    const paused = await canvas.findByRole('radio', { name: 'Paused' })
    await expect(paused).toBeChecked()
    await userEvent.click(canvas.getByRole('radio', { name: 'Open' }))
    await waitFor(() =>
      expect(canvas.getByRole('radio', { name: 'Open' })).toBeChecked(),
    )
    await userEvent.click(canvas.getByRole('switch', { name: 'Sponsor strip' }))
    await waitFor(() =>
      expect(
        canvas.getByRole('switch', { name: 'Sponsor strip' }),
      ).toBeChecked(),
    )
    await expect(updates).toEqual([
      { postingMode: 'open' },
      { sponsorStrip: true },
    ])
  },
}
