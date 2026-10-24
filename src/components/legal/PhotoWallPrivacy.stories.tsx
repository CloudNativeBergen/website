import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PhotoWallCookieNote, PhotoWallPrivacy } from './PhotoWallPrivacy'

const meta = {
  title: 'Components/PhotoWallPrivacy',
  component: PhotoWallPrivacy,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'How /privacy describes the Photo Wall (Photo Wall spec §12): its own card in section 2 (`#photo-wall`, where the composer’s consent line links), and its cookie in the cookies section. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof PhotoWallPrivacy>

export default meta
type Story = StoryObj<typeof meta>

export const Section: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 3, name: 'Photo Wall' }),
    ).toBeInTheDocument()
    await expect(canvasElement.querySelector('#photo-wall')).not.toBeNull()
  },
}

export const CookieNote: Story = {
  render: () => <PhotoWallCookieNote />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/sent only to the wall/),
    ).toBeInTheDocument()
  },
}

export const SectionDark: Story = { ...Section, globals: { theme: 'dark' } }

export const CookieNoteDark: Story = {
  ...CookieNote,
  globals: { theme: 'dark' },
}
