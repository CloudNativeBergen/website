import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ImageUploadZone } from './ImageUploadZone'
import { NotificationProvider } from '../NotificationProvider'

// The app's only react-dropzone surface. Kept inspectable in isolation so the
// drop target (which the library renders via getRootProps/getInputProps) can be
// eyeballed after a react-dropzone upgrade — its majors have moved both the
// packaging and the drop semantics.

const meta = {
  title: 'Systems/Proposals/Admin/Gallery/ImageUploadZone',
  component: ImageUploadZone,
  parameters: {
    docs: {
      description: {
        component:
          'Drag-and-drop gallery uploader: metadata row (photographer, location, date/time, featured) above a react-dropzone drop target. Client-side resize + EXIF date extraction happen on drop; uploads run 3-at-a-time with per-file progress. Inspect at 393px and in dark mode.',
      },
    },
  },
  args: {
    onUploadComplete: fn(),
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="p-4">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof ImageUploadZone>

export default meta
type Story = StoryObj<typeof meta>

/** Empty state: required metadata fields plus the idle drop target. */
export const Default: Story = {}

/** Pre-filled metadata, as the gallery page passes it from the last upload. */
export const WithDefaultMetadata: Story = {
  args: {
    defaultMetadata: {
      photographer: 'Olav Nordmann',
      location: 'Grieghallen, Bergen',
      date: '2026-06-12T14:30:00Z',
      featured: true,
    },
  },
}

/** Phone width — the metadata row wraps above a full-width drop target. */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
