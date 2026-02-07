'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline'

export interface ActionItem {
  label: string
  href?: string
  onClick?: () => void
  icon?: React.ReactNode
  variant?: 'primary' | 'secondary'
  disabled?: boolean
  target?: string
  hidden?: boolean
  /** Escape hatch for complex custom action components */
  render?: () => React.ReactNode
}

interface AdminHeaderActionsProps {
  items: ActionItem[]
}

function actionClasses(variant: ActionItem['variant'] = 'primary') {
  if (variant === 'secondary') {
    return 'inline-flex items-center rounded-lg bg-gray-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-500 dark:bg-gray-500 dark:hover:bg-gray-400'
  }
  return 'inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400'
}

export function AdminHeaderActions({ items }: AdminHeaderActionsProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <>
      {/* Desktop: show all buttons */}
      <div className="hidden gap-2 lg:flex">
        {items
          .filter((i) => !i.hidden)
          .map((item) => {
            if (item.render) {
              return <span key={item.label}>{item.render()}</span>
            }
            const cls = actionClasses(item.variant)
            if (item.href) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  target={item.target}
                  rel={
                    item.target === '_blank' ? 'noopener noreferrer' : undefined
                  }
                  className={cls}
                >
                  {item.icon && (
                    <span className="mr-2 h-4 w-4">{item.icon}</span>
                  )}
                  {item.label}
                </Link>
              )
            }
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                disabled={item.disabled}
                className={`${cls} disabled:opacity-50`}
              >
                {item.icon && <span className="mr-2 h-4 w-4">{item.icon}</span>}
                {item.label}
              </button>
            )
          })}
      </div>

      {/* Mobile: dropdown menu */}
      <div className="relative lg:hidden" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded-lg border border-gray-300 bg-white p-2 text-gray-500 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
          aria-label="Actions menu"
        >
          <EllipsisVerticalIcon className="h-5 w-5" />
        </button>
        {open && (
          <div className="absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-gray-800 dark:ring-gray-700">
            {items
              .filter((i) => !i.hidden)
              .map((item) => {
                if (item.render) {
                  return (
                    <div
                      key={item.label}
                      className="px-4 py-2.5"
                      onClick={() => setOpen(false)}
                    >
                      {item.render()}
                    </div>
                  )
                }
                const cls =
                  'flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-50'
                if (item.href) {
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      target={item.target}
                      rel={
                        item.target === '_blank'
                          ? 'noopener noreferrer'
                          : undefined
                      }
                      className={cls}
                      onClick={() => setOpen(false)}
                    >
                      {item.icon && (
                        <span className="h-4 w-4 text-gray-400 dark:text-gray-500">
                          {item.icon}
                        </span>
                      )}
                      {item.label}
                    </Link>
                  )
                }
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      item.onClick?.()
                      setOpen(false)
                    }}
                    disabled={item.disabled}
                    className={cls}
                  >
                    {item.icon && (
                      <span className="h-4 w-4 text-gray-400 dark:text-gray-500">
                        {item.icon}
                      </span>
                    )}
                    {item.label}
                  </button>
                )
              })}
          </div>
        )}
      </div>
    </>
  )
}
