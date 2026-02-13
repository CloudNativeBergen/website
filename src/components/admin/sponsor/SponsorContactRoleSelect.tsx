import { CONTACT_ROLE_OPTIONS } from '@/lib/sponsor/types'
import clsx from 'clsx'

interface SponsorContactRoleSelectProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

const defaultClassName =
  'rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none'

export function SponsorContactRoleSelect({
  value,
  onChange,
  placeholder = 'Select role...',
  className,
  disabled = false,
}: SponsorContactRoleSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={clsx(className || defaultClassName, !value && 'text-gray-400')}
    >
      <option value="" className="text-gray-400">
        {placeholder}
      </option>
      {CONTACT_ROLE_OPTIONS.map((role) => (
        <option key={role} value={role}>
          {role}
        </option>
      ))}
    </select>
  )
}
