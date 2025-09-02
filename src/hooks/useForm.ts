import { useState, useCallback } from 'react'

interface UseFormOptions<T> {
  initialValues: T
  validate?: (values: T) => Record<string, string>
  onSubmit?: (values: T) => void | Promise<void>
}

interface UseFormReturn<T> {
  values: T
  errors: Record<string, string>
  touched: Record<string, boolean>
  isSubmitting: boolean
  isDirty: boolean

  // Form actions
  setValue: (field: keyof T, value: T[keyof T]) => void
  setValues: (values: Partial<T>) => void
  setFieldTouched: (field: keyof T, touched?: boolean) => void
  setErrors: (errors: Record<string, string>) => void

  // Form handlers
  handleChange: (field: keyof T) => (value: T[keyof T]) => void
  handleSubmit: (e?: React.FormEvent) => Promise<void>
  handleReset: () => void

  // Validation
  validateField: (field: keyof T) => string | undefined
  validateForm: () => boolean

  // Utility
  getFieldProps: (field: keyof T) => {
    value: T[keyof T]
    onChange: (value: T[keyof T]) => void
    error?: string
    touched: boolean
  }
}

/**
 * Reusable form management hook with validation and error handling
 */
export function useForm<T extends Record<string, any>>(
  options: UseFormOptions<T>,
): UseFormReturn<T> {
  const { initialValues, validate, onSubmit } = options

  const [values, setValuesState] = useState<T>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Check if form is dirty (has changes)
  const isDirty = Object.keys(values).some(
    (key) => values[key] !== initialValues[key],
  )

  const setValue = useCallback(
    (field: keyof T, value: T[keyof T]) => {
      setValuesState((prev) => ({ ...prev, [field]: value }))

      // Clear error when user starts typing
      if (errors[field as string]) {
        setErrors((prev) => {
          const newErrors = { ...prev }
          delete newErrors[field as string]
          return newErrors
        })
      }
    },
    [errors],
  )

  const setValues = useCallback((newValues: Partial<T>) => {
    setValuesState((prev) => ({ ...prev, ...newValues }))
  }, [])

  const setFieldTouched = useCallback((field: keyof T, isTouched = true) => {
    setTouched((prev) => ({ ...prev, [field as string]: isTouched }))
  }, [])

  const handleChange = useCallback(
    (field: keyof T) => {
      return (value: T[keyof T]) => {
        setValue(field, value)
      }
    },
    [setValue],
  )

  const validateField = useCallback(
    (field: keyof T): string | undefined => {
      if (!validate) return undefined

      const fieldErrors = validate(values)
      return fieldErrors[field as string]
    },
    [validate, values],
  )

  const validateForm = useCallback((): boolean => {
    if (!validate) return true

    const validationErrors = validate(values)
    setErrors(validationErrors)

    return Object.keys(validationErrors).length === 0
  }, [validate, values])

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) {
        e.preventDefault()
      }

      setIsSubmitting(true)

      try {
        // Mark all fields as touched
        const allTouched = Object.keys(values).reduce(
          (acc, key) => ({ ...acc, [key]: true }),
          {},
        )
        setTouched(allTouched)

        // Validate form
        if (!validateForm()) {
          return
        }

        // Submit form
        if (onSubmit) {
          await onSubmit(values)
        }
      } catch (error) {
        console.error('Form submission error:', error)
        // Let the parent component handle submission errors
        throw error
      } finally {
        setIsSubmitting(false)
      }
    },
    [values, validateForm, onSubmit],
  )

  const handleReset = useCallback(() => {
    setValuesState(initialValues)
    setErrors({})
    setTouched({})
    setIsSubmitting(false)
  }, [initialValues])

  const getFieldProps = useCallback(
    (field: keyof T) => {
      return {
        value: values[field],
        onChange: handleChange(field),
        error: touched[field as string] ? errors[field as string] : undefined,
        touched: Boolean(touched[field as string]),
      }
    },
    [values, touched, errors, handleChange],
  )

  return {
    values,
    errors,
    touched,
    isSubmitting,
    isDirty,

    setValue,
    setValues,
    setFieldTouched,
    setErrors,

    handleChange,
    handleSubmit,
    handleReset,

    validateField,
    validateForm,

    getFieldProps,
  }
}
