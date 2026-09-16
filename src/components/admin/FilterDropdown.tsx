'use client'

import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import clsx from 'clsx'
import { ReactNode } from 'react'
import { classNames } from './utils'

interface FilterDropdownProps {
  label: string
  activeCount: number
  children: ReactNode
  position?: 'left' | 'right'
  width?: 'default' | 'wide' | 'wider'
  keepOpen?: boolean
  disabled?: boolean
  size?: 'default' | 'sm'
}

export function FilterDropdown({
  label,
  activeCount,
  children,
  position = 'left',
  width = 'default',
  disabled = false,
  size = 'default',
}: FilterDropdownProps) {
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

  /**
   * The panel is ANCHORED: Headless UI renders it in a portal and positions it
   * with floating-ui.
   *
   * ONE caller was actually broken without this — the discount manager's
   * sponsor table sits inside an `overflow-hidden` wrapper, which cut the
   * ticket-type menu to a ~100px sliver on a phone that `overflow: hidden`
   * refuses to scroll, so the options could not be reached at all. For the
   * other callers portaling is a visual no-op today (no clipping ancestor);
   * it is applied to all of them because correct positioning is not a
   * per-caller choice, and a flag would be the thing that rots.
   *
   * Anchoring also flips the panel when it does not fit below, which is what
   * the hand-rolled IntersectionObserver drop-up used to approximate.
   */
  const anchor = {
    to: `bottom ${position === 'right' ? 'end' : 'start'}`,
    gap: 8,
  } as const

  return (
    <Menu as="div" className="relative">
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
              )}
            >
              {/* The count sits OUTSIDE the truncating span: inside it, a long
                  label on a narrow screen truncated the number away. */}
              <span className="min-w-0 flex-1 truncate text-left">{label}</span>
              {activeCount > 0 && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                  {activeCount}
                </span>
              )}
              <ChevronDownIcon
                className={clsx(
                  '-mr-1 text-gray-400 transition-transform duration-200 dark:text-gray-500',
                  size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
                  open ? 'rotate-180' : '',
                )}
              />
            </MenuButton>
            <MenuItems
              transition
              anchor={anchor}
              className={clsx(
                'z-50 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none dark:bg-gray-800 dark:ring-gray-600/5',
                getWidthClass(),
                // Never taller than the space the anchor leaves, so the list
                // scrolls inside the panel instead of running off-screen.
                'max-h-[min(20rem,var(--anchor-max-height))]',
                'origin-top transition duration-100 ease-out data-closed:scale-95 data-closed:opacity-0 data-leave:duration-75 data-leave:ease-in',
              )}
            >
              <div className="py-1">{children}</div>
            </MenuItems>
          </>
        )
      }}
    </Menu>
  )
}

/** A plain command at the foot of a dropdown — not a filter value. */
export function FilterAction({
  onClick,
  children,
}: {
  onClick: () => void
  children: ReactNode
}) {
  return (
    <MenuItem>
      {({ focus }) => (
        <button
          type="button"
          onClick={onClick}
          className={classNames(
            focus
              ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white'
              : 'text-indigo-600 dark:text-indigo-400',
            'mt-1 flex w-full items-center border-t border-gray-200 px-4 py-2 text-sm font-medium dark:border-gray-700',
          )}
        >
          {children}
        </button>
      )}
    </MenuItem>
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
