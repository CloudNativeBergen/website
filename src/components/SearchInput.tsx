import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  inputClassName?: string
  autoFocus?: boolean
  id?: string
  showClearButton?: boolean
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  inputClassName,
  autoFocus,
  id,
  showClearButton,
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className={
          inputClassName ??
          'block w-full rounded-md border border-gray-300 bg-white py-2 pr-3 pl-10 text-sm leading-5 placeholder-gray-500 focus:border-blue-500 focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400'
        }
      />
      {showClearButton && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
