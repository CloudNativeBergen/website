import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { useState } from 'react'

import { SponsorGlobalInfoFields } from './SponsorGlobalInfoFields'

const meta = {
  title: 'Systems/Sponsors/Form/SponsorGlobalInfoFields',
  component: SponsorGlobalInfoFields,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Form fields for editing global sponsor information (name and website). Used within sponsor forms to collect basic company details.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SponsorGlobalInfoFields>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    name: '',
    website: '',
    onNameChange: fn(),
    onWebsiteChange: fn(),
  },
}

export const WithValues: Story = {
  args: {
    name: 'Acme Corporation',
    website: 'https://acme.com',
    onNameChange: fn(),
    onWebsiteChange: fn(),
  },
}

export const Disabled: Story = {
  args: {
    name: 'Read Only Corp',
    website: 'https://readonly.com',
    onNameChange: fn(),
    onWebsiteChange: fn(),
    disabled: true,
  },
}

/**
 * Interactive story that demonstrates controlled form behavior.
 */
const InteractiveTemplate = () => {
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-4">
        <SponsorGlobalInfoFields
          name={name}
          website={website}
          onNameChange={setName}
          onWebsiteChange={setWebsite}
        />
      </div>
      <div className="mt-4 rounded-md bg-gray-100 p-4 text-sm dark:bg-gray-800">
        <p>
          <strong>Current values:</strong>
        </p>
        <p>Name: {name || '(empty)'}</p>
        <p>Website: {website || '(empty)'}</p>
      </div>
    </div>
  )
}

export const Interactive: Story = {
  render: () => <InteractiveTemplate />,
  args: {
    name: '',
    website: '',
    onNameChange: fn(),
    onWebsiteChange: fn(),
  },
}

export const NameChangeTest: Story = {
  args: {
    name: '',
    website: '',
    onNameChange: fn(),
    onWebsiteChange: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const nameInput = canvas.getByLabelText('Company Name *')
    await userEvent.type(nameInput, 'Test Company')
    await expect(args.onNameChange).toHaveBeenCalled()
  },
}

export const WebsiteChangeTest: Story = {
  args: {
    name: '',
    website: '',
    onNameChange: fn(),
    onWebsiteChange: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const websiteInput = canvas.getByLabelText('Website *')
    await userEvent.type(websiteInput, 'https://test.com')
    await expect(args.onWebsiteChange).toHaveBeenCalled()
  },
}
