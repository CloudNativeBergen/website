'use client'

import { ChevronDownIcon } from '@heroicons/react/20/solid'
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from '@headlessui/react'
import clsx from 'clsx'
import { Fragment, ReactNode, useEffect, useRef, useState } from 'react'
import { classNames } from './utils'

interface FilterDropdownProps {
  label: string
  activeCount: number
  children: ReactNode
  position?: 'left' | 'right'
  width?: 'default' | 'wide' | 'wider'
  fixedWidth?: boolean
  keepOpen?: boolean
  disabled?: boolean
  forceDropUp?: boolean
  size?: 'default' | 'sm'
}

export function FilterDropdown({
  label,
  activeCount,
  children,
  position = 'left',
  width = 'default',
  fixedWidth = false,
  disabled = false,
  forceDropUp = false,
  size = 'default',
}: FilterDropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [shouldDropUp, setShouldDropUp] = useState(forceDropUp)
  const [isClient] = useState(() => typeof window !== 'undefined')

  const getWidthClass = () => {
    switch (width) {
      case 'wide':
        return 'w-64'
      case 'wider':
        return 'w-72'
      default:
        return 'w-56'
    }
  }

  const getButtonWidthClass = () => {
    switch (width) {
      case 'wide':
        return 'w-64 min-w-64'
      case 'wider':
        return 'w-72 min-w-72'
      default:
        return 'w-56 min-w-56'
    }
  }

  const checkDropDirection = () => {
    if (!menuRef.current || forceDropUp) {
      return
    }

    const rect = menuRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight

    const isInBottomThird = rect.bottom > viewportHeight * 0.67

    if (isInBottomThird !== shouldDropUp) {
      setShouldDropUp(isInBottomThird)
    }
  }

  useEffect(() => {
    if (!isClient || !menuRef.current || forceDropUp) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry) {
          const isNearBottom =
            entry.intersectionRatio < 0.5 ||
            entry.boundingClientRect.bottom > window.innerHeight * 0.7

          if (isNearBottom !== shouldDropUp) {
            setShouldDropUp(isNearBottom)
          }
        }
      },
      {
        threshold: [0, 0.25, 0.5, 0.75, 1],
        rootMargin: '0px 0px -30% 0px',
      },
    )

    observer.observe(menuRef.current)

    return () => {
      observer.disconnect()
    }
  }, [isClient, shouldDropUp, forceDropUp])

  const handleMenuButtonClick = () => {
    requestAnimationFrame(() => {
      checkDropDirection()
    })
  }

  const getDropdownClasses = () => {
    const baseClasses = `absolute z-50 ${getWidthClass()} ring-opacity-5 rounded-md bg-white shadow-lg ring-1 ring-black focus:outline-none dark:bg-gray-800 dark:ring-gray-600`

    const classes = shouldDropUp
      ? `${baseClasses} bottom-full mb-2 ${
          position === 'right'
            ? 'right-0 origin-bottom-right'
            : 'left-0 origin-bottom-left'
        }`
      : `${baseClasses} top-full mt-2 ${
          position === 'right'
            ? 'right-0 origin-top-right'
            : 'left-0 origin-top-left'
        }`

    return classes
  }
  return (
    <Menu as="div" className="relative" ref={menuRef}>
      {({ open }) => {
        return (
          <>
            <MenuButton
              disabled={disabled}
              className={clsx(
                'inline-flex w-full items-center justify-between gap-x-1.5 rounded-lg outline-1 -outline-offset-1 transition-all',
                size === 'sm'
                  ? 'h-9 px-2.5 text-xs'
                  : 'px-3 py-1.5 text-base sm:text-sm/6',
                disabled
                  ? 'cursor-not-allowed bg-gray-50 text-gray-400 outline-gray-200 dark:bg-gray-800/50 dark:text-gray-600 dark:outline-gray-700'
                  : 'bg-white text-gray-900 ring-1 ring-gray-300 outline-gray-300 ring-inset hover:bg-gray-50 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:outline-white/10 dark:hover:bg-gray-600',
                fixedWidth ? getButtonWidthClass() : '',
              )}
              onClick={handleMenuButtonClick}
            >
              <span className="min-w-0 truncate text-left">
                {label}
                {activeCount > 0 && (
                  <span className="ml-1 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                    {activeCount}
                  </span>
                )}
              </span>
              <ChevronDownIcon
                className={clsx(
                  '-mr-1 text-gray-400 transition-transform duration-200 dark:text-gray-500',
                  size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
                  isClient && shouldDropUp ? 'rotate-180' : '',
                )}
              />
            </MenuButton>
            {open && (
              <Transition
                as={Fragment}
                show={open}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
                beforeEnter={() => {
                  checkDropDirection()
                }}
              >
                <MenuItems className={getDropdownClasses()}>
                  <div className="py-1">{children}</div>
                </MenuItems>
              </Transition>
            )}
          </>
        )
      }}
    </Menu>
  )
}

interface FilterOptionProps {
  onClick: () => void
  checked: boolean
  children: ReactNode
  className?: string
  type?: 'checkbox' | 'radio'
  keepOpen?: boolean
}

export function FilterOption({
  onClick,
  checked,
  children,
  className,
  type = 'checkbox',
  keepOpen = false,
}: FilterOptionProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (keepOpen) {
      e.preventDefault()
      e.stopPropagation()
    }
    onClick()
  }

  return (
    <MenuItem>
      {({ focus }) => (
        <button
          onClick={handleClick}
          className={classNames(
            focus
              ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white'
              : 'text-gray-700 dark:text-gray-300',
            'group flex w-full items-center px-4 py-2 text-sm',
            className,
          )}
        >
          <input
            type={type}
            checked={checked}
            onChange={() => {}}
            className={
              type === 'radio'
                ? 'mr-3 h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700'
                : 'mr-3 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700'
            }
          />
          <span className="text-left">{children}</span>
        </button>
      )}
    </MenuItem>
  )
}
