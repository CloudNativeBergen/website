'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import {
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'

type NotificationType = 'success' | 'error' | 'info' | 'warning'

interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number
}

interface NotificationContextType {
  showNotification: (notification: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
)

interface NotificationProviderProps {
  children: ReactNode
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const showNotification = (notification: Omit<Notification, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 15)
    const newNotification = { ...notification, id }

    setNotifications((prev) => [...prev, newNotification])

    // Auto-remove after duration (default 5 seconds)
    const duration = notification.duration ?? 5000
    setTimeout(() => {
      removeNotification(id)
    }, duration)
  }

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return CheckCircleIcon
      case 'error':
        return XCircleIcon
      case 'warning':
        return ExclamationTriangleIcon
      case 'info':
      default:
        return InformationCircleIcon
    }
  }

  const getStyles = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return {
          container: 'border-green-200 bg-green-50',
          icon: 'text-green-400',
          title: 'text-green-800',
          message: 'text-green-700',
        }
      case 'error':
        return {
          container: 'border-red-200 bg-red-50',
          icon: 'text-red-400',
          title: 'text-red-800',
          message: 'text-red-700',
        }
      case 'warning':
        return {
          container: 'border-yellow-200 bg-yellow-50',
          icon: 'text-yellow-400',
          title: 'text-yellow-800',
          message: 'text-yellow-700',
        }
      case 'info':
      default:
        return {
          container: 'border-brand-cloud-blue/20 bg-brand-sky-mist',
          icon: 'text-brand-cloud-blue',
          title: 'text-brand-slate-gray',
          message: 'text-brand-slate-gray/80',
        }
    }
  }

  return (
    <NotificationContext.Provider
      value={{ showNotification, removeNotification }}
    >
      {children}

      {/* Notification Container */}
      <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-end justify-start space-y-4 p-6">
        {notifications.map((notification) => {
          const Icon = getIcon(notification.type)
          const styles = getStyles(notification.type)

          return (
            <div
              key={notification.id}
              className={clsx(
                'pointer-events-auto max-w-sm transform rounded-xl border p-4 shadow-lg transition-all duration-300 ease-in-out',
                styles.container,
                'animate-in slide-in-from-right-2 fade-in-0',
              )}
            >
              <div className="flex">
                <div className="flex-shrink-0">
                  <Icon className={clsx('h-5 w-5', styles.icon)} />
                </div>
                <div className="ml-3 w-0 flex-1">
                  <p
                    className={clsx(
                      'font-space-grotesk text-sm font-medium',
                      styles.title,
                    )}
                  >
                    {notification.title}
                  </p>
                  {notification.message && (
                    <p
                      className={clsx(
                        'font-inter mt-1 text-sm',
                        styles.message,
                      )}
                    >
                      {notification.message}
                    </p>
                  )}
                </div>
                <div className="ml-4 flex flex-shrink-0">
                  <button
                    className={clsx(
                      'inline-flex rounded-md p-1.5 transition-colors hover:bg-black/10',
                      styles.icon,
                    )}
                    onClick={() => removeNotification(notification.id)}
                  >
                    <span className="sr-only">Dismiss</span>
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error(
      'useNotification must be used within a NotificationProvider',
    )
  }
  return context
}
