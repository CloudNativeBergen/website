import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { SearchInput } from './SearchInput'

const meta = {
  title: 'Components/Forms/SearchInput',
  component: SearchInput,
  tags: ['autodocs'],
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof SearchInput>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    value: '',
    placeholder: 'Search...',
  },
}

export const WithValue: Story = {
  args: {
    value: 'kubernetes',
    placeholder: 'Search...',
  },
}

export const WithClearButton: Story = {
  args: {
    value: 'kubernetes',
    placeholder: 'Search...',
    showClearButton: true,
  },
}

export const CustomPlaceholder: Story = {
  args: {
    value: '',
    placeholder: 'Search speakers by name or title...',
  },
}
