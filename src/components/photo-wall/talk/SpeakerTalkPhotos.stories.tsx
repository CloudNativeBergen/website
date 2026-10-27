import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { STORY_PHOTOS, storyPhoto } from '@/components/photo-wall/story-photos'
import type { SpeakerTalkPhotos } from '@/lib/photo-wall/wall'
import { SpeakerTalkPhotoList } from './SpeakerTalkPhotos'
import { TalkPhotoRow } from './TalkPhotos'

const FIXTURES = Object.values(STORY_PHOTOS)
const posts = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({
    _id: `post-${from + i}`,
    ...storyPhoto(FIXTURES[(from + i) % FIXTURES.length]),
    caption: null,
    name: null,
    approvedAt: '2026-10-26T10:00:00Z',
  }))

const talks: SpeakerTalkPhotos[] = [
  {
    talkId: 'talk-1',
    title: 'Running Kubernetes at the edge',
    hidden: false,
    posts: posts(4),
  },
  {
    talkId: 'talk-2',
    title: 'Panel: platform engineering in practice',
    hidden: true,
    posts: posts(2, 4),
  },
]

const meta = {
  title: 'Systems/PhotoWall/SpeakerTalkPhotos',
  component: SpeakerTalkPhotoList,
  parameters: { layout: 'padded' },
  args: { talks },
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SpeakerTalkPhotoList>

export default meta
type Story = StoryObj<typeof meta>

/** Photos of your talks on `/cfp/list` (talk photos spec §7.3). */
export const Dashboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Photos of your talks (6)')).toBeVisible()
    await expect(canvas.getByText(/Hidden from public pages/)).toBeVisible()
    await expect(canvas.getAllByRole('link')).toHaveLength(6)
  },
}
export const DashboardDark: Story = { ...Dashboard, globals: { theme: 'dark' } }

/** A session on `/speaker/[slug]` with its photos (§7.2). */
export const SpeakerPage: Story = {
  render: () => (
    <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
      <h3 className="font-space-grotesk text-xl font-semibold text-brand-slate-gray dark:text-white">
        Running Kubernetes at the edge
      </h3>
      <TalkPhotoRow view={{ posts: posts(6), count: 9 }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Photos from this talk (9)')).toBeVisible()
  },
}
export const SpeakerPageDark: Story = {
  ...SpeakerPage,
  globals: { theme: 'dark' },
}
