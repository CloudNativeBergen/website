'use client'

import { CurrencySelect } from '@/components/CurrencySelect'

interface ContractValueInputProps {
  value: string
  currency: string
  onValueChange: (value: string) => void
  onCurrencyChange: (currency: string) => void
}

export function ContractValueInput({
  value,
  currency,
  onValueChange,
  onCurrencyChange,
}: ContractValueInputProps) {
  return (
    <div>
      <label className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
        Contract Value
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10"
        />
        <div className="w-28">
          <CurrencySelect
            value={currency}
            setValue={onCurrencyChange}
            name="contract-currency"
          />
        </div>
      </div>
    </div>
  )
}
