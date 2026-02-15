'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { NotificationToast } from './NotificationToast'
import type { NotificationType } from './NotificationToast'

interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number
  count?: number
  timeoutId?: NodeJS.Timeout
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
    const duration = notification.duration ?? 5000

    // Check if an identical notification already exists
    setNotifications((prev) => {
      const existingIndex = prev.findIndex(
        (n) =>
          n.type === notification.type &&
          n.title === notification.title &&
          n.message === notification.message,
      )

      if (existingIndex !== -1) {
        // Found duplicate - increment count and reset timer
        const existing = prev[existingIndex]

        // Clear old timeout
        if (existing.timeoutId) {
          clearTimeout(existing.timeoutId)
        }

        // Create new timeout
        const timeoutId = setTimeout(() => {
          removeNotification(existing.id)
        }, duration)

        // Update the notification with incremented count
        const updated = [...prev]
        updated[existingIndex] = {
          ...existing,
          count: (existing.count || 1) + 1,
          timeoutId,
        }
        return updated
      } else {
        // New unique notification
        const id = Math.random().toString(36).substring(2, 15)
        const timeoutId = setTimeout(() => {
          removeNotification(id)
        }, duration)

        const newNotification: Notification = {
          ...notification,
          id,
          count: 1,
          timeoutId,
        }
        return [...prev, newNotification]
      }
    })
  }

  const removeNotification = (id: string) => {
    setNotifications((prev) => {
      const notification = prev.find((n) => n.id === id)
      if (notification?.timeoutId) {
        clearTimeout(notification.timeoutId)
      }
      return prev.filter((n) => n.id !== id)
    })
  }

  return (
    <NotificationContext.Provider
      value={{ showNotification, removeNotification }}
    >
      {children}

      <div className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-end justify-end space-y-6 p-6 pr-8 pb-8">
        {notifications.map((notification) => (
          <NotificationToast
            key={notification.id}
            notification={notification}
            onDismiss={removeNotification}
          />
        ))}
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
