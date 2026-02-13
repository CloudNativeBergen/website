import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { FilterDropdown, FilterOption } from './FilterDropdown'

const meta = {
  title: 'Components/Forms/FilterDropdown',
  component: FilterDropdown,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A dropdown menu for filter options with checkbox/radio selections. Automatically detects position and drops up when near the bottom of the viewport.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="flex min-h-75 items-start justify-center pt-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FilterDropdown>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    label: 'Status',
    activeCount: 0,
    children: (
      <>
        <FilterOption onClick={() => {}} checked={false}>
          Submitted
        </FilterOption>
        <FilterOption onClick={() => {}} checked={false}>
          Accepted
        </FilterOption>
        <FilterOption onClick={() => {}} checked={false}>
          Rejected
        </FilterOption>
      </>
    ),
  },
}

export const WithActiveFilters: Story = {
  args: {
    label: 'Format',
    activeCount: 2,
    children: (
      <>
        <FilterOption onClick={() => {}} checked={true}>
          Lightning Talk (10 min)
        </FilterOption>
        <FilterOption onClick={() => {}} checked={true}>
          Presentation (45 min)
        </FilterOption>
        <FilterOption onClick={() => {}} checked={false}>
          Workshop (120 min)
        </FilterOption>
      </>
    ),
  },
}

export const RadioOptions: Story = {
  args: {
    label: 'Sort by',
    activeCount: 1,
    children: (
      <>
        <FilterOption onClick={() => {}} checked={true} type="radio">
          Newest first
        </FilterOption>
        <FilterOption onClick={() => {}} checked={false} type="radio">
          Oldest first
        </FilterOption>
        <FilterOption onClick={() => {}} checked={false} type="radio">
          Highest rated
        </FilterOption>
      </>
    ),
  },
}

export const WideDropdown: Story = {
  args: {
    label: 'Topics',
    activeCount: 0,
    width: 'wide',
    children: (
      <>
        <FilterOption onClick={() => {}} checked={false}>
          Kubernetes & Container Orchestration
        </FilterOption>
        <FilterOption onClick={() => {}} checked={false}>
          Cloud Native Security
        </FilterOption>
        <FilterOption onClick={() => {}} checked={false}>
          Observability & Monitoring
        </FilterOption>
      </>
    ),
  },
}

export const RightAligned: Story = {
  args: {
    label: 'Actions',
    activeCount: 0,
    position: 'right',
    children: (
      <>
        <FilterOption onClick={() => {}} checked={false}>
          Export CSV
        </FilterOption>
        <FilterOption onClick={() => {}} checked={false}>
          Send emails
        </FilterOption>
      </>
    ),
  },
}

export const SmallSize: Story = {
  args: {
    label: 'Level',
    activeCount: 1,
    size: 'sm',
    children: (
      <>
        <FilterOption onClick={() => {}} checked={false}>
          Beginner
        </FilterOption>
        <FilterOption onClick={() => {}} checked={true}>
          Intermediate
        </FilterOption>
        <FilterOption onClick={() => {}} checked={false}>
          Advanced
        </FilterOption>
      </>
    ),
  },
}

export const Disabled: Story = {
  args: {
    label: 'Disabled Filter',
    activeCount: 0,
    disabled: true,
    children: (
      <>
        <FilterOption onClick={() => {}} checked={false}>
          Option 1
        </FilterOption>
        <FilterOption onClick={() => {}} checked={false}>
          Option 2
        </FilterOption>
      </>
    ),
  },
}

export const Interactive: Story = {
  args: {
    label: 'Status',
    activeCount: 0,
    children: null,
  },
  render: () => {
    const InteractiveDemo = () => {
      const [selected, setSelected] = useState<string[]>([])

      const toggleOption = (option: string) => {
        setSelected((prev) =>
          prev.includes(option)
            ? prev.filter((o) => o !== option)
            : [...prev, option],
        )
      }

      const options = ['Submitted', 'Accepted', 'Confirmed', 'Rejected']

      return (
        <FilterDropdown label="Status" activeCount={selected.length}>
          {options.map((option) => (
            <FilterOption
              key={option}
              onClick={() => toggleOption(option)}
              checked={selected.includes(option)}
              keepOpen
            >
              {option}
            </FilterOption>
          ))}
        </FilterDropdown>
      )
    }
    return <InteractiveDemo />
  },
}
