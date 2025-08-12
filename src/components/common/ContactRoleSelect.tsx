import { CONTACT_ROLE_OPTIONS } from '@/lib/sponsor/types'

interface ContactRoleSelectProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function ContactRoleSelect({
  value,
  onChange,
  placeholder = 'Select role...',
  className = '',
  disabled = false,
}: ContactRoleSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none ${className}`}
    >
      <option value="">{placeholder}</option>
      {CONTACT_ROLE_OPTIONS.map((role) => (
        <option key={role} value={role}>
          {role}
        </option>
      ))}
    </select>
  )
}
