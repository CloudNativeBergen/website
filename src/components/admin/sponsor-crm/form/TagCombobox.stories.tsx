/* eslint-disable react-hooks/rules-of-hooks */
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TagCombobox } from './TagCombobox'
import { useState } from 'react'
import type { SponsorTag } from '@/lib/sponsor-crm/types'

const meta: Meta<typeof TagCombobox> = {
  title: 'Admin/Sponsors/Form/TagCombobox',
  component: TagCombobox,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Multi-select combobox for tagging sponsors with classification labels (Local, Return Sponsor, Tech Partner, Media Partner, Previous Speaker, Referral, Strategic, VIP). Tags help organize and filter sponsors in the CRM pipeline. Uses Fresh Green badges for selected tags.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof TagCombobox>

export const Interactive: Story = {
  render: () => {
    const [value, setValue] = useState<SponsorTag[]>([
      'warm-lead',
      'returning-sponsor',
    ])
    return <TagCombobox value={value} onChange={setValue} />
  },
}

export const Empty: Story = {
  render: () => {
    const [value, setValue] = useState<SponsorTag[]>([])
    return <TagCombobox value={value} onChange={setValue} />
  },
}

export const SingleTag: Story = {
  render: () => {
    const [value, setValue] = useState<SponsorTag[]>(['warm-lead'])
    return <TagCombobox value={value} onChange={setValue} />
  },
}

export const MultipleTags: Story = {
  render: () => {
    const [value, setValue] = useState<SponsorTag[]>([
      'warm-lead',
      'returning-sponsor',
      'high-priority',
    ])
    return <TagCombobox value={value} onChange={setValue} />
  },
}

export const ManyTags: Story = {
  render: () => {
    const [value, setValue] = useState<SponsorTag[]>([
      'warm-lead',
      'returning-sponsor',
      'high-priority',
      'needs-follow-up',
      'multi-year-potential',
    ])
    return <TagCombobox value={value} onChange={setValue} />
  },
}
