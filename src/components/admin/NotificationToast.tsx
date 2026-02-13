'use client'

import {
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface NotificationData {
  id: string
  type: NotificationType
  title: string
  message?: string
  count?: number
}

interface NotificationToastProps {
  notification: NotificationData
  onDismiss: (id: string) => void
}

function getStyles(type: NotificationType) {
  switch (type) {
    case 'success':
      return {
        container:
          'border-brand-fresh-green/30 bg-gradient-to-r from-brand-glacier-white to-green-50/50 backdrop-blur-sm dark:border-green-400/30 dark:from-gray-800 dark:to-green-900/30',
        icon: 'text-brand-fresh-green dark:text-green-400',
        title: 'text-brand-slate-gray dark:text-white',
        message: 'text-brand-slate-gray/80 dark:text-gray-300',
      }
    case 'error':
      return {
        container:
          'border-red-300/50 bg-gradient-to-r from-brand-glacier-white to-red-50/50 backdrop-blur-sm dark:border-red-400/30 dark:from-gray-800 dark:to-red-900/30',
        icon: 'text-red-500 dark:text-red-400',
        title: 'text-brand-slate-gray dark:text-white',
        message: 'text-brand-slate-gray/80 dark:text-gray-300',
      }
    case 'warning':
      return {
        container:
          'border-brand-sunbeam-yellow/40 bg-gradient-to-r from-brand-glacier-white to-yellow-50/50 backdrop-blur-sm dark:border-yellow-400/30 dark:from-gray-800 dark:to-yellow-900/30',
        icon: 'text-brand-sunbeam-yellow dark:text-yellow-400',
        title: 'text-brand-slate-gray dark:text-white',
        message: 'text-brand-slate-gray/80 dark:text-gray-300',
      }
    case 'info':
    default:
      return {
        container:
          'border-brand-cloud-blue/30 bg-gradient-to-r from-brand-glacier-white to-brand-sky-mist/70 backdrop-blur-sm dark:border-blue-400/30 dark:from-gray-800 dark:to-blue-900/30',
        icon: 'text-brand-cloud-blue dark:text-blue-400',
        title: 'text-brand-slate-gray dark:text-white',
        message: 'text-brand-slate-gray/80 dark:text-gray-300',
      }
  }
}

const iconMap: Record<NotificationType, typeof CheckCircleIcon> = {
  success: CheckCircleIcon,
  error: XCircleIcon,
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon,
}

export function NotificationToast({
  notification,
  onDismiss,
}: NotificationToastProps) {
  const Icon = iconMap[notification.type]
  const styles = getStyles(notification.type)

  return (
    <div
      className={clsx(
        'pointer-events-auto w-full max-w-sm transform rounded-lg border-2 p-6 shadow-2xl ring-1 ring-black/5 transition-all duration-300 ease-in-out sm:max-w-md md:max-w-lg dark:ring-white/10',
        styles.container,
        'animate-in slide-in-from-right-2 fade-in-0',
      )}
    >
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <Icon className={clsx('mt-0.5 h-6 w-6', styles.icon)} />
          {notification.count && notification.count > 1 && (
            <span
              className={clsx(
                'absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white shadow-lg',
                notification.type === 'success' &&
                'bg-brand-fresh-green dark:bg-green-500',
                notification.type === 'error' && 'bg-red-500',
                notification.type === 'warning' &&
                'bg-brand-sunbeam-yellow dark:bg-yellow-500',
                notification.type === 'info' &&
                'bg-brand-cloud-blue dark:bg-blue-500',
              )}
            >
              {notification.count}
            </span>
          )}
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
        <div className="shrink-0">
          <button
            className={clsx(
              'inline-flex rounded-md p-1.5 transition-all duration-200 hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:hover:bg-white/10',
              styles.icon,
            )}
            onClick={() => onDismiss(notification.id)}
          >
            <span className="sr-only">Dismiss</span>
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
