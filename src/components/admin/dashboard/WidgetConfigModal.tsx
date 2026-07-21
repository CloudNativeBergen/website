'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { CogIcon } from '@heroicons/react/24/solid'
import type { WidgetConfigField } from '@/lib/dashboard/types'
import { getWidgetMetadata } from '@/lib/dashboard/widget-registry'
import { AdminButton } from '@/components/admin/AdminButton'
import { ModalShell } from '@/components/ModalShell'

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
      const configChanged =
        JSON.stringify(lastConfigRef.current) !== JSON.stringify(currentConfig)

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
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        size="md"
        padded={false}
        title="Configure Widget"
        subtitle={widgetDisplayName}
        icon={<CogIcon className="h-5 w-5" />}
      >
        <div className="px-6 py-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This widget does not have configurable settings.
          </p>
          <div className="mt-4">
            <AdminButton color="blue" size="md" onClick={onClose}>
              Close
            </AdminButton>
          </div>
        </div>
      </ModalShell>
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
    onSave(result.data)
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
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      padded={false}
      title="Configure Widget"
      subtitle={widgetDisplayName}
      icon={<CogIcon className="h-5 w-5" />}
    >
      {/* Only the Save button submits (explicit type="submit"); AdminButton
          defaults to type="button", so Cancel/Reset can never submit. */}
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

        {/* Footer: stacked full-width buttons on mobile (no wrapping at
            narrow widths), Reset left / Cancel+Save right from sm up. */}
        <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="justify-center py-2.5 sm:justify-start sm:py-2"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Reset to Defaults
            </AdminButton>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:gap-3">
              <AdminButton
                variant="secondary"
                size="md"
                onClick={onClose}
                className="w-full py-2.5 sm:w-auto sm:py-2"
              >
                Cancel
              </AdminButton>
              <AdminButton
                color="blue"
                size="md"
                type="submit"
                className="w-full py-2.5 sm:w-auto sm:py-2"
              >
                Save Changes
              </AdminButton>
            </div>
          </div>
        </div>
      </form>
    </ModalShell>
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
              onChange={(e) => onChange(e.target.valueAsNumber)}
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
