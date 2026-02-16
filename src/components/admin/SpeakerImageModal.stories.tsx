import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpeakerImageModal } from './SpeakerImageModal'
import { useState } from 'react'

const meta = {
  title: 'Components/Admin/SpeakerImageModal',
  component: SpeakerImageModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof SpeakerImageModal>

export default meta
type Story = StoryObj<typeof meta>

const SpeakerImageModalWrapper = ({
  speaker,
}: {
  speaker: { name: string; title?: string; image: string }
}) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-cloud-blue/90"
      >
        Open Speaker Image Modal
      </button>
      <SpeakerImageModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        speaker={speaker}
      />
    </div>
  )
}

export const Default: Story = {
  render: () => (
    <SpeakerImageModalWrapper
      speaker={{
        name: 'Jane Smith',
        title: 'Senior Software Engineer',
        image:
          'https://cdn.sanity.io/images/your-project-id/production/example-image.jpg',
      }}
    />
  ),
}

export const WithoutTitle: Story = {
  render: () => (
    <SpeakerImageModalWrapper
      speaker={{
        name: 'John Doe',
        image:
          'https://cdn.sanity.io/images/your-project-id/production/example-image.jpg',
      }}
    />
  ),
}
