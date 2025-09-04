'use client'

import { ChevronDownIcon } from '@heroicons/react/20/solid'
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from '@headlessui/react'
import { Fragment, ReactNode, useEffect, useRef, useState } from 'react'
import { classNames } from './utils'

interface FilterDropdownProps {
  label: string
  activeCount: number
  children: ReactNode
  position?: 'left' | 'right'
  width?: 'default' | 'wide' | 'wider'
  fixedWidth?: boolean // Whether button should have fixed width (default: false)
  keepOpen?: boolean // For multi-select filters
}

/**
 * Reusable filter dropdown component
 * Provides consistent styling and behavior for filter menus
 * Automatically drops up when too close to the bottom of the viewport
 */
export function FilterDropdown({
  label,
  activeCount,
  children,
  position = 'left',
  width = 'default',
  fixedWidth = false,
}: FilterDropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [shouldDropUp, setShouldDropUp] = useState(false)

  const getWidthClass = () => {
    switch (width) {
      case 'wide':
        return 'w-64' // 16rem / 256px
      case 'wider':
        return 'w-72' // 18rem / 288px
      default:
        return 'w-56' // 14rem / 224px
    }
  }

  const getButtonWidthClass = () => {
    switch (width) {
      case 'wide':
        return 'w-64 min-w-64' // 16rem / 256px
      case 'wider':
        return 'w-72 min-w-72' // 18rem / 288px
      default:
        return 'w-56 min-w-56' // 14rem / 224px
    }
  }

  // More aggressive detection using a larger threshold
  const checkDropDirection = () => {
    console.log('🔍 checkDropDirection called')

    if (!menuRef.current) {
      console.log('❌ No menuRef.current')
      return
    }

    const rect = menuRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight

    // Much more aggressive: if we're in the bottom third of the screen, drop up
    const isInBottomThird = rect.bottom > viewportHeight * 0.67

    console.log('📊 Dropdown position analysis:', {
      buttonTop: rect.top,
      buttonBottom: rect.bottom,
      buttonHeight: rect.height,
      viewportHeight,
      bottomThirdThreshold: viewportHeight * 0.67,
      isInBottomThird,
      currentShouldDropUp: shouldDropUp,
      willChange: isInBottomThird !== shouldDropUp,
    })

    if (isInBottomThird !== shouldDropUp) {
      console.log(
        `🔄 Changing shouldDropUp from ${shouldDropUp} to ${isInBottomThird}`,
      )
      setShouldDropUp(isInBottomThird)
    }
  }

  // Use intersection observer for more reliable detection
  useEffect(() => {
    console.log('🚀 Setting up IntersectionObserver')

    if (!menuRef.current) {
      console.log('❌ No menuRef.current for observer')
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        console.log('👁️ IntersectionObserver triggered')
        const entry = entries[0]
        if (entry) {
          // If less than 50% of the button is visible, we're probably near the bottom
          const isNearBottom =
            entry.intersectionRatio < 0.5 ||
            entry.boundingClientRect.bottom > window.innerHeight * 0.7

          console.log('📏 Intersection data:', {
            intersectionRatio: entry.intersectionRatio,
            boundingClientRect: entry.boundingClientRect,
            isNearBottom,
            currentState: shouldDropUp,
          })

          if (isNearBottom !== shouldDropUp) {
            console.log(
              `🔄 Observer changing shouldDropUp from ${shouldDropUp} to ${isNearBottom}`,
            )
            setShouldDropUp(isNearBottom)
          }
        }
      },
      {
        threshold: [0, 0.25, 0.5, 0.75, 1],
        rootMargin: '0px 0px -30% 0px', // Trigger when entering bottom 30% of viewport
      },
    )

    observer.observe(menuRef.current)
    console.log('✅ Observer attached to menu element')

    return () => {
      console.log('🧹 Cleaning up observer')
      observer.disconnect()
    }
  }, [shouldDropUp])

  // Force check on click
  const handleMenuButtonClick = () => {
    console.log('🖱️ Menu button clicked')
    requestAnimationFrame(() => {
      console.log('🎬 requestAnimationFrame callback executing')
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

    console.log('🎨 Generated dropdown classes:', {
      shouldDropUp,
      classes,
      baseClasses,
      position,
    })

    return classes
  }
  return (
    <Menu as="div" className="relative" ref={menuRef}>
      {({ open }) => {
        console.log('🔄 Menu render:', { open, shouldDropUp, label })

        return (
          <>
            <MenuButton
              className={`inline-flex items-center justify-between gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-700 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-600 ${
                fixedWidth ? getButtonWidthClass() : ''
              }`}
              onClick={handleMenuButtonClick}
            >
              <span className="min-w-0 truncate text-left">
                {label}
                {activeCount > 0 && (
                  <span className="ml-1 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                    {activeCount}
                  </span>
                )}
              </span>
              <ChevronDownIcon
                className={`-mr-1 h-5 w-5 text-gray-400 transition-transform duration-200 dark:text-gray-500 ${
                  shouldDropUp ? 'rotate-180' : ''
                }`}
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
                  console.log(
                    '🚪 Dropdown about to open, beforeEnter triggered',
                  )
                  checkDropDirection()
                }}
                afterEnter={() => {
                  console.log('✅ Dropdown has opened, afterEnter triggered')
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

/**
 * Individual filter option component
 * Used within FilterDropdown for consistent option styling
 */
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
