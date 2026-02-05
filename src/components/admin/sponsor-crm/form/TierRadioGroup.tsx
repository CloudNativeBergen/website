'use client'

import { SponsorTier } from '@/lib/sponsor/types'

interface TierRadioGroupProps {
  tiers: SponsorTier[]
  value: string
  onChange: (value: string) => void
}

export function TierRadioGroup({
  tiers,
  value,
  onChange,
}: TierRadioGroupProps) {
  return (
    <fieldset>
      <legend className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
        Sponsor Tier
      </legend>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {tiers.map((tier) => (
          <label
            key={tier._id}
            aria-label={tier.title}
            className="group relative flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 has-checked:border-indigo-600 has-checked:bg-indigo-50 has-checked:text-indigo-600 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-indigo-600 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 dark:has-checked:border-indigo-500 dark:has-checked:bg-indigo-500/10 dark:has-checked:text-indigo-400"
          >
            <input
              type="radio"
              name="tier"
              value={tier._id}
              checked={value === tier._id}
              onChange={(e) => onChange(e.target.value)}
              className="absolute inset-0 appearance-none focus:outline-none"
            />
            <span className="whitespace-nowrap text-gray-900 group-has-checked:text-indigo-600 dark:text-white dark:group-has-checked:text-indigo-400">
              {tier.title}
            </span>
          </label>
        ))}
        <label
          aria-label="No tier"
          className="group relative flex cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 has-checked:border-indigo-600 has-checked:bg-indigo-50 has-checked:text-indigo-600 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-indigo-600 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 dark:has-checked:border-indigo-500 dark:has-checked:bg-indigo-500/10 dark:has-checked:text-indigo-400"
        >
          <input
            type="radio"
            name="tier"
            value=""
            checked={!value}
            onChange={() => onChange('')}
            className="absolute inset-0 appearance-none focus:outline-none"
          />
          <span className="whitespace-nowrap text-gray-900 group-has-checked:text-indigo-600 dark:text-white dark:group-has-checked:text-indigo-400">
            No tier
          </span>
        </label>
      </div>
    </fieldset>
  )
}
