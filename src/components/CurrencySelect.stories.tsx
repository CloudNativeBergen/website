import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { CurrencySelect } from './CurrencySelect'

function CurrencySelectDemo({
  initialValue = 'NOK',
  disabled,
}: {
  initialValue?: string
  disabled?: boolean
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <CurrencySelect value={value} setValue={setValue} disabled={disabled} />
  )
}

const meta: Meta<typeof CurrencySelect> = {
  title: 'Components/Forms/CurrencySelect',
  component: CurrencySelect,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Dropdown for selecting a currency code. Wraps the generic Dropdown component with pre-populated currency options from Sanity constants.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-xs p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof CurrencySelect>

export const Default: Story = {
  render: () => <CurrencySelectDemo />,
}

export const USD: Story = {
  render: () => <CurrencySelectDemo initialValue="USD" />,
}

export const Disabled: Story = {
  render: () => <CurrencySelectDemo disabled />,
}
