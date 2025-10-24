import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/16/solid'
import {
  LinkIcon,
  MinusCircleIcon,
  PlusCircleIcon,
} from '@heroicons/react/24/solid'

export function Input({
  name,
  label,
  value,
  setValue,
  type = 'text',
}: {
  name: string
  label: string
  value?: string
  setValue?: (val: string) => void
  type?: string
}) {
  return (
    <>
      <label
        htmlFor={name}
        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
      >
        {label}
      </label>
      <div className="mt-2">
        <input
          type={type}
          name={name}
          id={name}
          value={value}
          readOnly={setValue === undefined}
          disabled={setValue === undefined}
          onChange={(e) => setValue && setValue(e.target.value)}
          autoComplete={name}
          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
        />
      </div>
    </>
  )
}

export function LinkInput({
  index,
  name,
  value,
  update,
  add,
  remove,
}: {
  index: number
  name: string
  value?: string
  update: (i: number, val: string) => void
  add: (i: number) => void
  remove: (i: number) => void
}) {
  return (
    <div key={name} className="mt-2 flex">
      <div className="-mr-px grid grow grid-cols-1 focus-within:relative">
        <input
          type="url"
          name={name}
          id={name}
          className="col-start-1 row-start-1 block w-full rounded-l-md bg-white py-1.5 pl-10 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
          value={value}
          onChange={(e) => update(index, e.target.value)}
        />
        <LinkIcon
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 ml-3 size-5 self-center text-gray-400 sm:size-4 dark:text-gray-500"
        />
      </div>
      <button
        type="button"
        className="flex shrink-0 items-center gap-x-1.5 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 focus:relative focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:hover:bg-white/10 dark:focus:outline-indigo-500"
        onClick={() => remove(index)}
      >
        <MinusCircleIcon
          className="h-5 w-5 text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        className="flex shrink-0 items-center gap-x-1.5 rounded-r-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 focus:relative focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:hover:bg-white/10 dark:focus:outline-indigo-500"
        onClick={() => add(index)}
      >
        <PlusCircleIcon
          className="h-5 w-5 text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
      </button>
    </div>
  )
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-sm/6 text-red-600 dark:text-red-400">{children}</p>
  )
}

export function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-sm/6 text-gray-600 dark:text-gray-400">
      {children}
    </p>
  )
}

export function Textarea({
  name,
  label,
  rows = 3,
  value,
  setValue,
}: {
  name: string
  label: string
  rows?: number
  value?: string
  setValue: (val: string) => void
}) {
  return (
    <>
      <label
        htmlFor={name}
        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
      >
        {label}
      </label>
      <div className="mt-2">
        <textarea
          id={name}
          name={name}
          rows={rows}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
        />
      </div>
    </>
  )
}

export function Dropdown({
  name,
  label,
  options,
  value,
  setValue,
  placeholder = 'Select an option',
}: {
  name: string
  label: string
  options: Map<string, string>
  value?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: (val: any) => void
  placeholder?: string
}) {
  return (
    <>
      <label
        htmlFor={name}
        className="block text-sm/6 font-medium text-gray-900 dark:text-white"
      >
        {label}
      </label>
      <div className="mt-2 grid grid-cols-1">
        <select
          id={name}
          name={name}
          autoComplete={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:*:bg-gray-800 dark:focus:outline-indigo-500"
        >
          {!value && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {Array.from(options).map(([key, value]) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4 dark:text-gray-400"
        />
      </div>
    </>
  )
}

export function Checkbox({
  name,
  label,
  value,
  setValue,
  children,
}: {
  name: string
  label: string
  value?: boolean
  setValue: (val: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 shrink-0 items-center">
        <div className="group grid size-4 grid-cols-1">
          <input
            id={name}
            name={name}
            type="checkbox"
            checked={value}
            onChange={(e) => setValue(e.target.checked)}
            className="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:checked:border-indigo-500 dark:checked:bg-indigo-500 dark:indeterminate:border-indigo-500 dark:indeterminate:bg-indigo-500 dark:focus-visible:outline-indigo-500 dark:disabled:border-white/5 dark:disabled:bg-white/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
          />
          <svg
            fill="none"
            viewBox="0 0 14 14"
            className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-disabled:stroke-gray-950/25 dark:group-has-disabled:stroke-white/25"
          >
            <path
              d="M3 8L6 11L11 3.5"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="opacity-0 group-has-checked:opacity-100"
            />
          </svg>
        </div>
      </div>
      <div className="text-sm/6">
        <label
          htmlFor={name}
          className="font-medium text-gray-900 dark:text-white"
        >
          {label}
        </label>
        {children}
      </div>
    </div>
  )
}

export function Multiselect({
  name,
  label,
  options,
  value,
  setValue,
  maxItems = 2,
  placeholder = 'Select...',
}: {
  name: string
  label: string
  options: { id: string; title: string; color?: string }[]
  value: string[]
  setValue: (val: string[]) => void
  maxItems?: number
  placeholder?: string
}) {
  return (
    <>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-gray-900 dark:text-white"
      >
        {label}
      </label>
      <div className="mt-2">
        <div className="relative">
          <div className="flex flex-wrap gap-2 rounded-md border border-gray-300 bg-white p-2 focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 dark:border-white/10 dark:bg-white/5 dark:focus-within:ring-indigo-500">
            {value.map((selectedId) => {
              const option = options.find((opt) => opt.id === selectedId)
              if (!option) return null
              return (
                <span
                  key={selectedId}
                  className="inline-flex items-center gap-x-1 rounded-full px-2 py-1 text-sm font-medium"
                  style={{
                    backgroundColor: option.color
                      ? `#${option.color}20`
                      : '#F3F4F6',
                    color: option.color ? `#${option.color}` : '#374151',
                  }}
                >
                  {option.title}
                  <button
                    type="button"
                    onClick={() =>
                      setValue(value.filter((id) => id !== selectedId))
                    }
                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-gray-200 focus:ring-2 focus:ring-indigo-600 focus:outline-none dark:hover:bg-gray-700 dark:focus:ring-indigo-500"
                  >
                    <span className="sr-only">Remove {option.title}</span>
                    <XMarkIcon className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              )
            })}
            <select
              id={name}
              name={name}
              value=""
              onChange={(e) => {
                const newValue = e.target.value
                if (
                  newValue &&
                  !value.includes(newValue) &&
                  value.length < maxItems
                ) {
                  setValue([...value, newValue])
                }
              }}
              disabled={value.length >= maxItems}
              className={`flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 placeholder-gray-400 focus:ring-0 dark:text-white dark:placeholder:text-gray-500 ${
                value.length >= maxItems ? 'cursor-not-allowed opacity-50' : ''
              }`}
            >
              <option value="">
                {value.length >= maxItems
                  ? `Max ${maxItems} selected`
                  : placeholder}
              </option>

              {options
                .filter((option) => !value.includes(option.id))
                .map((option, index) => (
                  <option key={`${option.id}-${index}`} value={option.id}>
                    {option.title}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>
    </>
  )
}
