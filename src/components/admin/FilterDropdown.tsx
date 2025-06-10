'use client'

import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { Menu, Transition } from '@headlessui/react'
import { Fragment, ReactNode } from 'react'
import { classNames } from './utils'

interface FilterDropdownProps {
  label: string
  activeCount: number
  children: ReactNode
}

/**
 * Reusable filter dropdown component
 * Provides consistent styling and behavior for filter menus
 */
export function FilterDropdown({ label, activeCount, children }: FilterDropdownProps) {
  return (
    <Menu as="div" className="relative">
      <Menu.Button className="inline-flex items-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
        {label}
        {activeCount > 0 && (
          <span className="ml-1 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
            {activeCount}
          </span>
        )}
        <ChevronDownIcon className="-mr-1 h-5 w-5 text-gray-400" />
      </Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute left-0 z-10 mt-2 w-56 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="py-1">
            {children}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  )
}

interface FilterOptionProps {
  onClick: () => void
  checked: boolean
  children: ReactNode
  className?: string
}

/**
 * Individual filter option component
 * Used within FilterDropdown for consistent option styling
 */
export function FilterOption({ onClick, checked, children, className }: FilterOptionProps) {
  return (
    <Menu.Item>
      {({ active }) => (
        <button
          onClick={onClick}
          className={classNames(
            active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
            'group flex w-full items-center px-4 py-2 text-sm',
            className
          )}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={() => { }}
            className="mr-3 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
          />
          {children}
        </button>
      )}
    </Menu.Item>
  )
}
