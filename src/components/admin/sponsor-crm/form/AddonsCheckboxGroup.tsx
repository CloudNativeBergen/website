'use client'

import { formatTierLabel } from '../utils'
import { SponsorTier } from '@/lib/sponsor/types'

interface AddonsCheckboxGroupProps {
  addons: SponsorTier[]
  value: string[]
  onChange: (value: string[]) => void
}

export function AddonsCheckboxGroup({
  addons,
  value,
  onChange,
}: AddonsCheckboxGroupProps) {
  if (addons.length === 0) {
    return null
  }

  const handleToggle = (addonId: string) => {
    if (value.includes(addonId)) {
      onChange(value.filter((id) => id !== addonId))
    } else {
      onChange([...value, addonId])
    }
  }

  return (
    <fieldset>
      <legend className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
        Add-ons{' '}
        <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
          (optional, multiple allowed)
        </span>
      </legend>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {addons.map((addon) => (
          <label
            key={addon._id}
            aria-label={addon.title}
            className="group relative flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 has-checked:border-emerald-600 has-checked:bg-emerald-50 has-checked:text-emerald-600 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-emerald-600 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 dark:has-checked:border-emerald-500 dark:has-checked:bg-emerald-500/10 dark:has-checked:text-emerald-400"
          >
            <input
              type="checkbox"
              name="addons"
              value={addon._id}
              checked={value.includes(addon._id)}
              onChange={() => handleToggle(addon._id)}
              className="absolute inset-0 appearance-none focus:outline-none"
            />
            <span className="whitespace-nowrap text-gray-900 group-has-checked:text-emerald-600 dark:text-white dark:group-has-checked:text-emerald-400">
              {formatTierLabel(addon)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
