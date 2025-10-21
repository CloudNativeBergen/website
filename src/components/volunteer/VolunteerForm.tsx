'use client'

import { useState, useEffect } from 'react'
import {
  Input,
  Textarea,
  Dropdown,
  Checkbox,
  HelpText,
} from '@/components/Form'
import { Occupation, TShirtSize } from '@/lib/volunteer/types'
import {
  CheckCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { PRIVACY_POLICY_VERSION } from '@/lib/privacy/config'
import { Button } from '@/components/Button'

interface VolunteerFormProps {
  conferenceId: string
}

export default function VolunteerForm({ conferenceId }: VolunteerFormProps) {
  const [formData, setFormData] = useState<{
    name: string
    email: string
    phone: string
    occupation: Occupation | ''
    availability: string
    preferredTasks: string
    tshirtSize: TShirtSize | ''
    dietaryRestrictions: string
    otherInfo: string
  }>({
    name: '',
    email: '',
    phone: '',
    occupation: '',
    availability: '',
    preferredTasks: '',
    tshirtSize: '',
    dietaryRestrictions: '',
    otherInfo: '',
  })

  const [dataProcessingConsent, setDataProcessingConsent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<{
    message: string
    fieldErrors?: Record<string, string[]>
    formErrors?: string[]
  } | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)

  const occupationOptions = new Map<string, string>([
    [Occupation.STUDENT, 'Student'],
    [Occupation.WORKING, 'Working'],
    [Occupation.UNEMPLOYED, 'Unemployed'],
    [Occupation.OTHER, 'Other'],
  ])

  const tshirtSizeOptions = new Map<string, string>([
    [TShirtSize.XS, 'XS'],
    [TShirtSize.S, 'S'],
    [TShirtSize.M, 'M'],
    [TShirtSize.L, 'L'],
    [TShirtSize.XL, 'XL'],
    [TShirtSize.XXL, 'XXL'],
  ])

  const updateField = (name: string) => (value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      occupation: '',
      availability: '',
      preferredTasks: '',
      tshirtSize: '',
      dietaryRestrictions: '',
      otherInfo: '',
    })
    setDataProcessingConsent(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (
      !formData.name ||
      !formData.email ||
      !formData.phone ||
      !formData.occupation
    ) {
      setSubmitError({ message: 'Please fill in all required fields' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    if (!dataProcessingConsent) {
      setSubmitError({
        message: 'You must agree to the privacy policy to continue',
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setIsSubmitting(true)

    try {
      const preferredTasksArray = formData.preferredTasks
        ? formData.preferredTasks
            .split(',')
            .map((task) => task.trim())
            .filter(Boolean)
        : []

      const payload = {
        ...formData,
        tshirtSize: formData.tshirtSize || undefined,
        availability: formData.availability || undefined,
        dietaryRestrictions: formData.dietaryRestrictions || undefined,
        otherInfo: formData.otherInfo || undefined,
        preferredTasks: preferredTasksArray,
        conferenceId,
        consent: {
          dataProcessing: dataProcessingConsent,
        },
      }

      const response = await fetch('/api/volunteer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.details?.formErrors || data.details?.fieldErrors) {
          setSubmitError({
            message: data.error || 'Validation failed',
            formErrors: data.details.formErrors,
            fieldErrors: data.details.fieldErrors,
          })
        } else {
          setSubmitError({
            message: data.error || 'Failed to submit volunteer application',
          })
        }
        window.scrollTo({ top: 0, behavior: 'smooth' })
        setIsSubmitting(false)
        return
      }

      setShowSuccess(true)
      resetForm()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setSubmitError({
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 10000)
      return () => clearTimeout(timer)
    }
  }, [showSuccess])

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {showSuccess && (
        <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
          <div className="flex">
            <div className="flex-shrink-0">
              <CheckCircleIcon
                className="h-5 w-5 text-green-400"
                aria-hidden="true"
              />
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Thank you for volunteering! We&apos;ll review your application
                and contact you soon.
              </p>
            </div>
            <div className="ml-auto pl-3">
              <button
                type="button"
                onClick={() => setShowSuccess(false)}
                className="inline-flex rounded-md bg-green-50 p-1.5 text-green-500 hover:bg-green-100 focus:ring-2 focus:ring-green-600 focus:ring-offset-2 focus:ring-offset-green-50 focus:outline-none dark:bg-green-900/20 dark:hover:bg-green-900/30"
              >
                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {submitError && (
        <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
          <div className="flex">
            <div className="flex-shrink-0">
              <XCircleIcon
                className="h-5 w-5 text-red-400"
                aria-hidden="true"
              />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {submitError.message}
              </p>
              {submitError.formErrors && submitError.formErrors.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-sm text-red-700 dark:text-red-300">
                  {submitError.formErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              )}
              {submitError.fieldErrors &&
                Object.keys(submitError.fieldErrors).length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm text-red-700 dark:text-red-300">
                    {Object.entries(submitError.fieldErrors).map(
                      ([field, errors]) =>
                        errors.map((error, index) => (
                          <li key={`${field}-${index}`}>
                            {field}: {error}
                          </li>
                        )),
                    )}
                  </ul>
                )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-white/50 p-6 backdrop-blur-sm dark:bg-gray-800/50">
        <h2 className="font-display mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Basic Information
        </h2>
        <div className="space-y-4">
          <div>
            <Input
              label="Full Name *"
              name="name"
              value={formData.name}
              setValue={updateField('name')}
            />
          </div>
          <div>
            <Input
              label="Email Address *"
              name="email"
              type="email"
              value={formData.email}
              setValue={updateField('email')}
            />
          </div>
          <div>
            <Input
              label="Phone Number *"
              name="phone"
              value={formData.phone}
              setValue={updateField('phone')}
            />
          </div>
          <div>
            <Dropdown
              name="occupation"
              label="Occupation *"
              value={formData.occupation}
              setValue={updateField('occupation')}
              options={occupationOptions}
              placeholder="Select your occupation"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white/50 p-6 backdrop-blur-sm dark:bg-gray-800/50">
        <h2 className="font-display mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Volunteer Details
        </h2>
        <div className="space-y-4">
          <div>
            <Textarea
              label="Availability"
              name="availability"
              value={formData.availability}
              setValue={updateField('availability')}
              rows={3}
            />
            <HelpText>
              Let us know when you&apos;re available to volunteer during the
              conference (e.g., All days, Morning only, Afternoon only)
            </HelpText>
          </div>
          <div>
            <Textarea
              label="Preferred Tasks"
              name="preferredTasks"
              value={formData.preferredTasks}
              setValue={updateField('preferredTasks')}
              rows={3}
            />
            <HelpText>
              Enter your preferred volunteer tasks (comma-separated). Choose
              from: Registration desk, Tech support, Speaker liaison, General
              assistance, Setup/teardown, or suggest your own
            </HelpText>
          </div>
          <div>
            <Dropdown
              name="tshirtSize"
              label="T-Shirt Size"
              value={formData.tshirtSize}
              setValue={updateField('tshirtSize')}
              options={tshirtSizeOptions}
              placeholder="Select a size (optional)"
            />
          </div>
          <div>
            <Textarea
              label="Dietary Restrictions"
              name="dietaryRestrictions"
              value={formData.dietaryRestrictions}
              setValue={updateField('dietaryRestrictions')}
              rows={2}
            />
            <HelpText>
              Let us know about any dietary restrictions or allergies (e.g.,
              Vegetarian, Vegan, Gluten-free)
            </HelpText>
          </div>
          <div>
            <Textarea
              label="Other Information"
              name="otherInfo"
              value={formData.otherInfo}
              setValue={updateField('otherInfo')}
              rows={3}
            />
            <HelpText>
              Previous volunteer experience, special skills, or anything else
              you&apos;d like us to know
            </HelpText>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white/50 p-6 backdrop-blur-sm dark:bg-gray-800/50">
        <h2 className="font-display mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Data Privacy Consent
        </h2>
        <Checkbox
          name="consent"
          label="Data Processing Consent"
          value={dataProcessingConsent}
          setValue={setDataProcessingConsent}
        >
          <p className="text-gray-600 dark:text-gray-400">
            I have read and agree to the{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-600 dark:hover:text-blue-400"
            >
              Privacy Policy
            </a>
            . Privacy Policy Version: {PRIVACY_POLICY_VERSION}. Your data will
            be processed in accordance with GDPR regulations.
          </p>
        </Checkbox>
      </div>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          onClick={resetForm}
          disabled={isSubmitting}
          variant="outline"
        >
          Reset Form
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit Application'}
        </Button>
      </div>
    </form>
  )
}
