/* eslint-disable react-hooks/rules-of-hooks */
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ContractValueInput } from './ContractValueInput'
import { useState } from 'react'

const meta: Meta<typeof ContractValueInput> = {
  title: 'Admin/Sponsors/Form/ContractValueInput',
  component: ContractValueInput,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Combined input for contract value with currency selector. Supports NOK, USD, EUR, and GBP. The value defaults to the sponsor tier price but can be customized for negotiated deals. Formats numbers with thousand separators and currency symbols for readability.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ContractValueInput>

export const Interactive: Story = {
  render: () => {
    const [value, setValue] = useState('100000')
    const [currency, setCurrency] = useState('NOK')
    return (
      <div className="space-y-4">
        <ContractValueInput
          value={value}
          currency={currency}
          onValueChange={setValue}
          onCurrencyChange={setCurrency}
        />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Value: <strong>{value || '0'}</strong> {currency}
        </p>
      </div>
    )
  },
}

export const DefaultValue: Story = {
  render: () => {
    const [value, setValue] = useState('100000')
    const [currency, setCurrency] = useState('NOK')
    return (
      <ContractValueInput
        value={value}
        currency={currency}
        onValueChange={setValue}
        onCurrencyChange={setCurrency}
      />
    )
  },
}

export const EmptyValue: Story = {
  render: () => {
    const [value, setValue] = useState('')
    const [currency, setCurrency] = useState('NOK')
    return (
      <ContractValueInput
        value={value}
        currency={currency}
        onValueChange={setValue}
        onCurrencyChange={setCurrency}
      />
    )
  },
}

export const LargeValue: Story = {
  render: () => {
    const [value, setValue] = useState('2500000')
    const [currency, setCurrency] = useState('NOK')
    return (
      <ContractValueInput
        value={value}
        currency={currency}
        onValueChange={setValue}
        onCurrencyChange={setCurrency}
      />
    )
  },
}

export const USD: Story = {
  render: () => {
    const [value, setValue] = useState('75000')
    const [currency, setCurrency] = useState('USD')
    return (
      <ContractValueInput
        value={value}
        currency={currency}
        onValueChange={setValue}
        onCurrencyChange={setCurrency}
      />
    )
  },
}

export const EUR: Story = {
  render: () => {
    const [value, setValue] = useState('50000')
    const [currency, setCurrency] = useState('EUR')
    return (
      <ContractValueInput
        value={value}
        currency={currency}
        onValueChange={setValue}
        onCurrencyChange={setCurrency}
      />
    )
  },
}

export const GBP: Story = {
  render: () => {
    const [value, setValue] = useState('45000')
    const [currency, setCurrency] = useState('GBP')
    return (
      <ContractValueInput
        value={value}
        currency={currency}
        onValueChange={setValue}
        onCurrencyChange={setCurrency}
      />
    )
  },
}
