import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { MobileFilterSheet } from './MobileFilterSheet'
import type { FilterGroup } from '@/components/admin/AdminFilterBar'

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/MobileFilterSheet',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        component:
          'Full-height, slide-up bottom sheet used below `lg` to host filter controls on mobile. Config-driven via `FilterGroup[]`; rendered by `AdminFilterBar` and reused directly by the sponsor CRM pipeline.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function MobileFilterSheetDemo() {
  const [isOpen, setIsOpen] = useState(true)
  const [tiers, setTiers] = useState<string[]>(['gold'])
  const [owner, setOwner] = useState<string>('')
  const [tags, setTags] = useState<string[]>([])

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    value: string,
  ) =>
    setter((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value],
    )

  const groups: FilterGroup[] = [
    {
      key: 'tier',
      label: 'Tier',
      options: [
        { value: 'platinum', label: 'Platinum' },
        { value: 'gold', label: 'Gold' },
        { value: 'silver', label: 'Silver' },
        { value: 'bronze', label: 'Bronze' },
      ],
      selected: tiers,
      onChange: (value) => toggle(setTiers, value),
    },
    {
      key: 'owner',
      label: 'Owner',
      multi: false,
      options: [
        { value: '', label: 'All' },
        { value: 'unassigned', label: 'Unassigned' },
        { value: 'alice', label: 'Alice Johnson' },
        { value: 'bob', label: 'Bob Smith' },
      ],
      selected: [owner],
      onChange: setOwner,
    },
    {
      key: 'tags',
      label: 'Tags',
      options: [
        { value: 'returning', label: 'Returning Sponsor' },
        { value: 'priority', label: 'Priority' },
        { value: 'follow-up', label: 'Needs Follow-up' },
        { value: 'local', label: 'Local Company' },
      ],
      selected: tags,
      onChange: (value) => toggle(setTags, value),
    },
  ]

  const activeFilterCount = tiers.length + (owner ? 1 : 0) + tags.length

  return (
    <div className="min-h-screen bg-gray-100 p-4 dark:bg-gray-950">
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
      >
        Open filters
      </button>
      <MobileFilterSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        groups={groups}
        onClearAll={() => {
          setTiers([])
          setOwner('')
          setTags([])
        }}
        activeFilterCount={activeFilterCount}
      />
    </div>
  )
}

export const Default: Story = {
  render: () => <MobileFilterSheetDemo />,
}
