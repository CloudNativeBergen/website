import { ChevronDownIcon } from '@heroicons/react/16/solid'

export function FilterSelect({
  icon: Icon,
  value,
  onChange,
  options,
  allLabel,
  className,
  ariaLabel,
}: {
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  value: string
  onChange: (value: string) => void
  options: Map<string, string>
  allLabel?: string
  className?: string
  ariaLabel?: string
}) {
  return (
    <div className={`relative ${Icon ? 'flex items-center gap-2' : ''}`}>
      {Icon && (
        <Icon className="pointer-events-none h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
      )}
      <div className="grid flex-1 grid-cols-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          className={
            className ??
            'col-start-1 row-start-1 w-full cursor-pointer appearance-none rounded-lg border border-gray-200 bg-gray-50 py-2 pr-8 pl-3 text-sm text-gray-900 transition-all focus:border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:bg-gray-600'
          }
        >
          {allLabel && <option value="">{allLabel}</option>}
          {Array.from(options).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4 dark:text-gray-400"
        />
      </div>
    </div>
  )
}
