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
          container:
            'border-brand-fresh-green/30 bg-gradient-to-r from-brand-glacier-white to-green-50/50 backdrop-blur-sm',
          icon: 'text-brand-fresh-green',
          title: 'text-brand-slate-gray',
          message: 'text-brand-slate-gray/80',
        }
      case 'error':
        return {
          container:
            'border-red-300/50 bg-gradient-to-r from-brand-glacier-white to-red-50/50 backdrop-blur-sm',
          icon: 'text-red-500',
          title: 'text-brand-slate-gray',
          message: 'text-brand-slate-gray/80',
        }
      case 'warning':
        return {
          container:
            'border-brand-sunbeam-yellow/40 bg-gradient-to-r from-brand-glacier-white to-yellow-50/50 backdrop-blur-sm',
          icon: 'text-brand-sunbeam-yellow',
          title: 'text-brand-slate-gray',
          message: 'text-brand-slate-gray/80',
        }
      case 'info':
      default:
        return {
          container:
            'border-brand-cloud-blue/30 bg-gradient-to-r from-brand-glacier-white to-brand-sky-mist/70 backdrop-blur-sm',
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
      <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-end justify-end space-y-6 p-6 pr-8 pb-8">
        {notifications.map((notification) => {
          const Icon = getIcon(notification.type)
          const styles = getStyles(notification.type)

          return (
            <div
              key={notification.id}
              className={clsx(
                'pointer-events-auto w-full max-w-sm transform rounded-lg border-2 p-6 shadow-2xl ring-1 ring-black/5 transition-all duration-300 ease-in-out sm:max-w-md md:max-w-lg',
                styles.container,
                'animate-in slide-in-from-right-2 fade-in-0',
              )}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <Icon className={clsx('mt-0.5 h-6 w-6', styles.icon)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={clsx(
                      'font-space-grotesk text-base leading-tight font-semibold',
                      styles.title,
                    )}
                  >
                    {notification.title}
                  </p>
                  {notification.message && (
                    <p
                      className={clsx(
                        'font-inter mt-2 text-sm leading-relaxed',
                        styles.message,
                      )}
                    >
                      {notification.message}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <button
                    className={clsx(
                      'inline-flex rounded-md p-1.5 transition-all duration-200 hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue',
                      styles.icon,
                    )}
                    onClick={() => removeNotification(notification.id)}
                  >
                    <span className="sr-only">Dismiss</span>
                    <XMarkIcon className="h-5 w-5" />
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
