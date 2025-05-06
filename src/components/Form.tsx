import { ChevronDownIcon } from '@heroicons/react/16/solid'
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
        className="block text-sm/6 font-medium text-gray-900"
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
          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
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
          className="col-start-1 row-start-1 block w-full rounded-l-md bg-white py-1.5 pl-10 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
          value={value}
          onChange={(e) => update(index, e.target.value)}
        />
        <LinkIcon
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 ml-3 size-5 self-center text-gray-400 sm:size-4"
        />
      </div>
      <button
        type="button"
        className="flex shrink-0 items-center gap-x-1.5 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 focus:relative focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"
        onClick={() => remove(index)}
      >
        <MinusCircleIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="flex shrink-0 items-center gap-x-1.5 rounded-r-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 focus:relative focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"
        onClick={() => add(index)}
      >
        <PlusCircleIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
      </button>
    </div>
  )
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm/6 text-red-600">{children}</p>
}

export function HelpText({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm/6 text-gray-600">{children}</p>
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
        className="block text-sm/6 font-medium text-gray-900"
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
          className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
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
}: {
  name: string
  label: string
  options: Map<string, string>
  value?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: (val: any) => void
}) {
  return (
    <>
      <label
        htmlFor={name}
        className="block text-sm/6 font-medium text-gray-900"
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
          className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
        >
          {Array.from(options).map(([key, value]) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4"
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
    <div className="relative flex gap-x-3">
      <div className="flex h-6 items-center">
        <input
          id={name}
          name={name}
          type="checkbox"
          checked={value}
          onChange={(e) => setValue(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
        />
      </div>
      <div className="text-sm/6">
        <label htmlFor={name} className="font-medium text-gray-900">
          {label}
        </label>
        {children}
      </div>
    </div>
  )
}
