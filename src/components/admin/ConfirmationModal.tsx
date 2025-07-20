'use client'

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/Button'

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmButtonText?: string
  cancelButtonText?: string
  variant?: 'danger' | 'warning' | 'info'
  isLoading?: boolean
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  variant = 'danger',
  isLoading = false,
}: ConfirmationModalProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          iconColor: 'text-red-600',
          iconBg: 'bg-red-100',
          confirmButton:
            'bg-red-600 hover:bg-red-500 focus-visible:outline-red-600',
        }
      case 'warning':
        return {
          iconColor: 'text-yellow-600',
          iconBg: 'bg-yellow-100',
          confirmButton:
            'bg-yellow-600 hover:bg-yellow-500 focus-visible:outline-yellow-600',
        }
      case 'info':
      default:
        return {
          iconColor: 'text-brand-cloud-blue',
          iconBg: 'bg-brand-sky-mist',
          confirmButton:
            'bg-brand-cloud-blue hover:bg-primary-700 focus-visible:outline-brand-cloud-blue',
        }
    }
  }

  const styles = getVariantStyles()

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-brand-slate-gray/60 backdrop-blur-sm" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="mx-auto max-w-md rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white p-6 shadow-2xl">
          <div className="flex">
            <div
              className={`mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${styles.iconBg}`}
            >
              <ExclamationTriangleIcon
                className={`h-6 w-6 ${styles.iconColor}`}
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="mt-4 text-center">
            <DialogTitle className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
              {title}
            </DialogTitle>
            <div className="mt-2">
              <p className="font-inter text-sm text-brand-slate-gray/80">
                {message}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Button
              onClick={onConfirm}
              disabled={isLoading}
              className={`font-space-grotesk w-full justify-center rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm ${styles.confirmButton} disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:flex-1`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Processing...
                </div>
              ) : (
                confirmButtonText
              )}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="font-space-grotesk w-full justify-center rounded-xl border-brand-frosted-steel px-4 py-3 text-sm font-semibold text-brand-slate-gray transition-all duration-200 hover:bg-brand-sky-mist disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:flex-1"
            >
              {cancelButtonText}
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
