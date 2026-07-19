import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { ImageMetadataModal } from './ImageMetadataModal'
import { NotificationProvider } from '../NotificationProvider'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { withPortalTheme } from '@/lib/storybook'

// Renders the REAL ImageMetadataModal (not the previous static mock shell that
// shipped two prod bugs). It sits on the shared ModalShell (C-batch: <sm
// bottom-sheet with 85dvh + safe-area padding, ref-scoped ⌘S submit). The
// speaker search (`speaker.admin.search`) and save (`gallery.admin.update`) are
// served by the msw handlers below; the global TRPCDecorator provides the
// client.

const speakerResults = [
  {
    _id: 'sp-1',
    name: 'Jane Doe',
    slug: 'jane-doe',
    title: 'Staff Engineer',
    image: null,
    isOrganizer: false,
  },
  {
    _id: 'sp-2',
    name: 'John Smith',
    slug: 'john-smith',
    title: 'SRE Lead',
    image: null,
    isOrganizer: true,
  },
]

// The global TRPCDecorator uses a non-batching httpLink, so each procedure is
// its own request answered with a single `{ result: { data } }` object.
const handlers = [
  http.get('/api/trpc/speaker.admin.search', () =>
    HttpResponse.json({ result: { data: speakerResults } }),
  ),
  http.post('/api/trpc/gallery.admin.update', () =>
    HttpResponse.json({ result: { data: { _id: 'img-1' } } }),
  ),
]

const singleImage: GalleryImageWithSpeakers = {
  _id: 'img-1',
  _rev: 'rev-1',
  _createdAt: '2026-06-12T14:30:00Z',
  _updatedAt: '2026-06-12T14:30:00Z',
  photographer: 'Olav Nordmann',
  date: '2026-06-12T14:30:00Z',
  location: 'Grieghallen, Bergen',
  featured: false,
  image: {
    _type: 'image',
    asset: {
      _ref: 'image-Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000-jpg',
      _type: 'reference',
    },
    alt: 'Keynote presentation at Cloud Native Days',
  },
  imageAlt: 'Keynote presentation at Cloud Native Days',
  speakers: [{ _id: 'sp-1', name: 'Jane Doe', slug: 'jane-doe' }],
}

const bulkImages: GalleryImageWithSpeakers[] = [
  singleImage,
  { ...singleImage, _id: 'img-2' },
  { ...singleImage, _id: 'img-3' },
  { ...singleImage, _id: 'img-4' },
  { ...singleImage, _id: 'img-5' },
]

const meta = {
  title: 'Systems/Proposals/Admin/Gallery/ImageMetadataModal',
  component: ImageMetadataModal,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'Modal for editing gallery image metadata (photographer, date/time, location, alt text, speaker tags, hotspot/crop, featured) in single or bulk mode. Uses `speaker.admin.search` and `gallery.admin.update`; ⌘S submits. Built on the shared ModalShell (mobile bottom-sheet). Inspect at 393px and in dark mode.',
      },
    },
  },
  args: {
    isOpen: true,
    onClose: fn(),
    onUpdate: fn(),
  },
  decorators: [
    withPortalTheme,
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof ImageMetadataModal>

export default meta
type Story = StoryObj<typeof meta>

/** Single-image edit: hotspot editor, date/time, alt text, featured toggle. */
export const SingleImage: Story = {
  args: { image: singleImage },
}

/**
 * Bulk edit across 5 images — only photographer, location and added speakers
 * apply. No hotspot editor.
 */
export const BulkEdit: Story = {
  args: { images: bulkImages },
}

/** Bulk edit at phone width — ModalShell presents it as a bottom sheet. */
export const Mobile: Story = {
  args: { images: bulkImages },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
