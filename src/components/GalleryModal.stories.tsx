import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Components/Feedback/GalleryModal',
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Full-screen gallery modal with image carousel, thumbnail navigation, speaker tags, and self-untag functionality. Uses `useImageCarousel` for keyboard/touch navigation and `useSession` for identifying the current speaker. Supports swipe gestures on mobile.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const mockImages = [
  {
    title: 'Keynote Presentation',
    photographer: 'Olav Nordmann',
    location: 'Grieghallen, Bergen',
    date: 'June 12, 2025',
    speakers: ['Jane Doe', 'John Smith'],
  },
  {
    title: 'Workshop Session',
    photographer: 'Olav Nordmann',
    location: 'Grieghallen, Bergen',
    date: 'June 12, 2025',
    speakers: ['Alice Johnson'],
  },
  {
    title: 'Networking Break',
    photographer: 'Kari Hansen',
    location: 'Grieghallen, Bergen',
    date: 'June 12, 2025',
    speakers: [],
  },
]

function MockGalleryModal() {
  const currentImage = mockImages[0]

  return (
    <div className="relative h-150 w-full bg-black">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 bg-black/50 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold text-white">
              1 of {mockImages.length}
            </h2>
            <span className="hidden text-sm text-gray-300/90 sm:block">
              {currentImage.location}
            </span>
          </div>
          <button className="rounded-md p-2 text-gray-400 hover:bg-gray-800 hover:text-white">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Image area */}
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-gray-800 to-gray-900">
            <div className="text-center text-gray-500">
              <div className="mx-auto mb-2 h-32 w-48 rounded-lg bg-gray-700/50" />
              <p className="text-sm">Gallery image placeholder</p>
            </div>
          </div>

          {/* Navigation arrows */}
          <button className="absolute top-1/2 left-4 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white backdrop-blur-sm">
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
          <button className="absolute top-1/2 right-4 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white backdrop-blur-sm">
            <ChevronRightIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Info panel */}
        <div className="border-t border-gray-800 bg-black/50 backdrop-blur-sm">
          <div className="px-4 py-4 sm:px-6">
            <div className="mb-4 space-y-2">
              <h3 className="text-xl font-semibold text-white">
                {currentImage.location}
              </h3>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-300/90">
                <span>Photo by {currentImage.photographer}</span>
                <span>{currentImage.date}</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {currentImage.speakers.map((speaker) => (
                  <span
                    key={speaker}
                    className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-400"
                  >
                    {speaker}
                  </span>
                ))}
              </div>
            </div>

            {/* Thumbnails */}
            <div className="flex space-x-2 overflow-x-auto pb-2">
              {mockImages.map((img, index) => (
                <div
                  key={img.title}
                  className={`relative h-16 w-24 shrink-0 overflow-hidden rounded ${index === 0
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-black'
                      : 'opacity-50'
                    }`}
                >
                  <div className="h-full w-full bg-gray-700" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Default: Story = {
  render: () => <MockGalleryModal />,
  parameters: {
    docs: {
      description: {
        story:
          'Full-screen gallery modal showing the first image in a carousel. Includes navigation arrows, photographer credit, speaker tags, and thumbnail strip. The actual component uses Sanity image URLs and supports keyboard navigation (← → arrows) and touch swipe gestures.',
      },
    },
  },
}
