'use client'

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react'
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/react/20/solid'

interface StatusOption<T extends string> {
  value: T
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}

interface StatusListboxProps<T extends string> {
  label: string
  value: T
  onChange: (value: T) => void
  options: StatusOption<T>[]
  disabled?: boolean
  helperText?: string
}

export function StatusListbox<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
  helperText,
}: StatusListboxProps<T>) {
  const selected = options.find((o) => o.value === value)
  const Icon = selected?.icon

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <label className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
        {label}
        {helperText && (
          <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
            {helperText}
          </span>
        )}
      </label>
      <div className="relative mt-1.5">
        <ListboxButton className="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-2 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10">
          <span className="col-start-1 row-start-1 flex items-center gap-3 pr-6">
            {Icon && <Icon className="h-5 w-5 text-gray-400" />}
            <span className="block truncate">{selected?.label}</span>
          </span>
          <ChevronUpDownIcon
            aria-hidden="true"
            className="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-400 sm:size-4"
          />
        </ListboxButton>
        <ListboxOptions
          transition
          className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline-1 -outline-offset-1 outline-gray-300 transition duration-100 ease-in data-closed:data-leave:opacity-0 sm:text-sm dark:bg-gray-800 dark:outline-white/10"
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-indigo-600 data-focus:text-white dark:text-white"
            >
              <div className="flex items-center gap-3">
                <option.icon className="h-5 w-5 text-gray-400 group-data-focus:text-white" />
                <span className="block truncate font-normal group-data-selected:font-semibold">
                  {option.label}
                </span>
              </div>
              <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-indigo-600 group-not-data-selected:hidden group-data-focus:text-white">
                <CheckIcon aria-hidden="true" className="size-5" />
              </span>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  )
}
