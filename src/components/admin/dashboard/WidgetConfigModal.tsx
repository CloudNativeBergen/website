'use client'

import { Fragment, useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { CogIcon } from '@heroicons/react/24/solid'
import type { WidgetConfigField } from '@/lib/dashboard/types'
import { getWidgetMetadata } from '@/lib/dashboard/widget-registry'

interface WidgetConfigModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Callback to close the modal */
  onClose: () => void
  /** Widget type to configure */
  widgetType: string
  /** Widget display name */
  widgetDisplayName: string
  /** Current configuration values */
  currentConfig?: Record<string, unknown>
  /** Callback when configuration is saved */
  onSave: (config: Record<string, unknown>) => void
}

export function WidgetConfigModal({
  isOpen,
  onClose,
  widgetType,
  widgetDisplayName,
  currentConfig = {},
  onSave,
}: WidgetConfigModalProps) {
  const metadata = getWidgetMetadata(widgetType)
  const configSchema = metadata?.configSchema

  // Track the last config to detect changes
  const lastConfigRef = useRef<Record<string, unknown> | null>(null)

  // Initialize form data from current config or defaults
  const getInitialFormData = () => {
    if (!configSchema) return {}
    const initialData: Record<string, unknown> = {}
    Object.entries(configSchema.fields).forEach(([key, field]) => {
      initialData[key] = currentConfig?.[key] ?? field.defaultValue
    })
    return initialData
  }

  const [formData, setFormData] =
    useState<Record<string, unknown>>(getInitialFormData)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset form data when modal opens or config changes
  useEffect(() => {
    if (isOpen && configSchema) {
      // Check if currentConfig has changed
      const configChanged = lastConfigRef.current !== currentConfig

      if (configChanged) {
        lastConfigRef.current = currentConfig
        const initialData = getInitialFormData()
        setFormData(initialData)
        setErrors({})
      }
    } else if (!isOpen) {
      // Reset tracking when modal closes
      lastConfigRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, configSchema, currentConfig])

  if (!configSchema) {
    return (
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={onClose}>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/25 dark:bg-black/50" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-gray-800">
                  <DialogTitle
                    as="h3"
                    className="text-lg leading-6 font-semibold text-gray-900 dark:text-gray-100"
                  >
                    No Configuration Available
                  </DialogTitle>
                  <div className="mt-2">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      This widget does not have configurable settings.
                    </p>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      onClick={onClose}
                    >
                      Close
                    </button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate using Zod schema
    const result = configSchema.schema.safeParse(formData)

    if (!result.success) {
      const newErrors: Record<string, string> = {}
      result.error.issues.forEach((issue) => {
        const path = issue.path.join('.')
        newErrors[path] = issue.message
      })
      setErrors(newErrors)
      return
    }

    setErrors({})
    onSave(formData)
    onClose()
  }

  const handleReset = () => {
    const resetData: Record<string, unknown> = {}
    Object.entries(configSchema.fields).forEach(([key, field]) => {
      resetData[key] = field.defaultValue
    })
    setFormData(resetData)
    setErrors({})
  }

  const handleFieldChange = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    // Clear error for this field
    if (errors[key]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[key]
        return newErrors
      })
    }
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25 dark:bg-black/50" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-lg bg-white shadow-xl transition-all dark:bg-gray-800">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <CogIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
                    <div>
                      <DialogTitle
                        as="h3"
                        className="text-lg leading-6 font-semibold text-gray-900 dark:text-gray-100"
                      >
                        Configure Widget
                      </DialogTitle>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {widgetDisplayName}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-gray-500 dark:hover:text-gray-400"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                  <div className="space-y-6 px-6 py-4">
                    {Object.entries(configSchema.fields).map(([key, field]) => (
                      <ConfigField
                        key={key}
                        fieldKey={key}
                        field={field}
                        value={formData[key]}
                        error={errors[key]}
                        onChange={(value) => handleFieldChange(key, value)}
                      />
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <ArrowPathIcon className="h-4 w-4" />
                      Reset to Defaults
                    </button>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

interface ConfigFieldProps {
  fieldKey: string
  field: WidgetConfigField
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}

function ConfigField({
  fieldKey,
  field,
  value,
  error,
  onChange,
}: ConfigFieldProps) {
  switch (field.type) {
    case 'number':
      return (
        <div>
          <label
            htmlFor={fieldKey}
            className="block text-sm font-medium text-gray-900 dark:text-gray-100"
          >
            {field.label}
          </label>
          {field.description && (
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {field.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              id={fieldKey}
              min={field.min}
              max={field.max}
              step={field.step}
              value={value as number}
              onChange={(e) => onChange(Number(e.target.value))}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            {field.unit && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {field.unit}
              </span>
            )}
          </div>
          {error && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )

    case 'boolean':
      return (
        <div className="flex items-start">
          <div className="flex h-6 items-center">
            <input
              type="checkbox"
              id={fieldKey}
              checked={value as boolean}
              onChange={(e) => onChange(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
            />
          </div>
          <div className="ml-3">
            <label
              htmlFor={fieldKey}
              className="text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              {field.label}
            </label>
            {field.description && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {field.description}
              </p>
            )}
          </div>
        </div>
      )

    case 'select':
      return (
        <div>
          <label
            htmlFor={fieldKey}
            className="block text-sm font-medium text-gray-900 dark:text-gray-100"
          >
            {field.label}
          </label>
          {field.description && (
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {field.description}
            </p>
          )}
          <select
            id={fieldKey}
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            {field.options.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
          {error && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )

    case 'text':
      return (
        <div>
          <label
            htmlFor={fieldKey}
            className="block text-sm font-medium text-gray-900 dark:text-gray-100"
          >
            {field.label}
          </label>
          {field.description && (
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {field.description}
            </p>
          )}
          <input
            type="text"
            id={fieldKey}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          {error && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )

    default:
      return null
  }
}
