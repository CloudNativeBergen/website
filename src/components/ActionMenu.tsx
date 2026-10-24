'use client'

import { EllipsisVerticalIcon } from '@heroicons/react/20/solid'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { ReactNode } from 'react'

interface ActionMenuProps {
  children: ReactNode
  position?: 'left' | 'right'
  ariaLabel?: string
}

export function ActionMenu({
  children,
  position = 'right',
  ariaLabel = 'Actions',
}: ActionMenuProps) {
  // `anchor` portals the menu out of the trigger's overflow container (e.g. a
  // scrolling table) and flips it up when there's no room below.
  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton
        className="inline-flex items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
        aria-label={ariaLabel}
      >
        <EllipsisVerticalIcon className="h-5 w-5" />
      </MenuButton>
      <MenuItems
        anchor={position === 'right' ? 'bottom end' : 'bottom start'}
        transition
        className="z-50 w-48 rounded-lg bg-white shadow-lg ring-1 ring-black/5 transition duration-100 ease-out [--anchor-gap:0.5rem] focus:outline-none data-closed:scale-95 data-closed:opacity-0 dark:bg-gray-800 dark:ring-gray-700/5"
      >
        <div className="py-1">{children}</div>
      </MenuItems>
    </Menu>
  )
}

interface ActionMenuItemProps {
  onClick?: () => void
  icon?: React.ComponentType<{ className?: string }>
  children: ReactNode
  variant?: 'default' | 'danger'
  disabled?: boolean
  title?: string
  href?: string
  download?: boolean | string
}

export function ActionMenuItem({
  onClick,
  icon: Icon,
  children,
  variant = 'default',
  disabled = false,
  title,
  href,
  download,
}: ActionMenuItemProps) {
  const baseClasses =
    'flex w-full items-center gap-3 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50'
  const variantClasses =
    variant === 'danger'
      ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'

  const Component = href ? 'a' : 'button'
  const extraProps = href
    ? { href, download }
    : { type: 'button' as const, disabled }

  return (
    <MenuItem>
      {() => (
        <Component
          onClick={onClick}
          className={`${baseClasses} ${variantClasses}`}
          role="menuitem"
          title={title}
          {...extraProps}
        >
          {Icon && <Icon className="h-4 w-4 shrink-0" />}
          <span className="min-w-0 truncate">{children}</span>
        </Component>
      )}
    </MenuItem>
  )
}

export function ActionMenuDivider() {
  return <div className="my-1 border-t border-gray-200 dark:border-gray-600" />
}
