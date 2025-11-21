'use client'

import { EllipsisVerticalIcon } from '@heroicons/react/20/solid'
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from '@headlessui/react'
import { Fragment, ReactNode, useEffect, useRef, useState } from 'react'

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
  const menuRef = useRef<HTMLDivElement>(null)
  const [shouldDropUp, setShouldDropUp] = useState(false)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  const checkDropDirection = () => {
    if (!menuRef.current) {
      return
    }

    const rect = menuRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight

    // Check if button is in bottom third of viewport
    const isInBottomThird = rect.bottom > viewportHeight * 0.67

    if (isInBottomThird !== shouldDropUp) {
      setShouldDropUp(isInBottomThird)
    }
  }

  useEffect(() => {
    if (!isClient || !menuRef.current) {
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
  }, [isClient, shouldDropUp])

  const handleMenuButtonClick = () => {
    requestAnimationFrame(() => {
      checkDropDirection()
    })
  }

  const getDropdownClasses = () => {
    const baseClasses =
      'absolute z-50 w-48 ring-opacity-5 rounded-lg bg-white shadow-lg ring-1 ring-black focus:outline-none dark:bg-gray-800 dark:ring-gray-700'

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
    <Menu as="div" className="relative inline-block text-left" ref={menuRef}>
      {({ open }) => (
        <>
          <MenuButton
            className="inline-flex items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            onClick={handleMenuButtonClick}
            aria-label={ariaLabel}
          >
            <EllipsisVerticalIcon className="h-5 w-5" />
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
      )}
    </Menu>
  )
}

interface ActionMenuItemProps {
  onClick: () => void
  icon?: React.ComponentType<{ className?: string }>
  children: ReactNode
  variant?: 'default' | 'danger'
  disabled?: boolean
  href?: string
  download?: boolean | string
}

export function ActionMenuItem({
  onClick,
  icon: Icon,
  children,
  variant = 'default',
  disabled = false,
  href,
  download,
}: ActionMenuItemProps) {
  const baseClasses =
    'flex w-full items-center gap-3 px-4 py-2 text-sm disabled:opacity-50'
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
          {...extraProps}
        >
          {Icon && <Icon className="h-4 w-4" />}
          <span>{children}</span>
        </Component>
      )}
    </MenuItem>
  )
}

export function ActionMenuDivider() {
  return <div className="my-1 border-t border-gray-200 dark:border-gray-600" />
}
